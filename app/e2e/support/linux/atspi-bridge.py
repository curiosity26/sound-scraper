"""The Linux end-to-end driver's link to the app: finds and presses its
elements through AT-SPI, the accessibility tree GTK exposes (which
react-native-gtk4 fills from the components' accessibility props).

Reads one JSON request per line on stdin and answers each with one JSON
line on stdout ({"ok": true, ...} or {"ok": false, "error": "..."}).
Requests ("name" is the element's accessible name; "match" is "exact"
(the default), "prefix" or "regex"):

- {"op": "find", "app": PID, "name": ..., "match": ..., "role": ...}
  "element": the first match's name, role and states, or null.
- {"op": "press", "app": PID, "name": ..., "match": ..., "role": ...}
  Performs the element's activate action (what Enter or a click does).
- {"op": "doubleClick", "app": PID, "name": ..., "match": ..., "role": ...}
  Activates the element twice, a moment apart (a double-click).
- {"op": "type", "app": PID, "text": ...}
  Replaces the text of the focused text field (an RN TextInput has no
  accessible name of its own, so it's found by focus) with "text".
- {"op": "key", "key": "Return"}
  Sends a key press (one of KEYSYMS) to the focused window.
- {"op": "names", "app": PID}
  "names": every named element as "role: name", for a failed find's message.

Elements are looked up in the application whose process is PID, in its
showing (on-screen) part of the tree, fresh on every request.
"""

import json
import re
import sys
import time
import warnings

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

# get_action_name's replacement, get_name, is hidden behind
# Accessible.get_name in Python.
warnings.filterwarnings("ignore", category=DeprecationWarning)

# The keys tests send, as X keysyms.
KEYSYMS = {"Return": 0xFF0D, "Escape": 0xFF1B, "Tab": 0xFF09}

# Bounds a walk of a broken (cyclic or huge) tree.
MAX_NODES = 20000


def application(pid):
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app is not None and app.get_process_id() == pid:
            return app
    return None


# Roles whose name GTK leaves to a labelled-by relation (a popover menu's
# items name themselves after their label), as screen readers resolve it.
LABELLED_ROLES = {"menu item", "check menu item", "radio menu item", "push button"}


def name_of(node):
    name = node.get_name() or ""
    if name or node.get_role_name() not in LABELLED_ROLES:
        return name
    for relation in node.get_relation_set():
        if relation.get_relation_type() != Atspi.RelationType.LABELLED_BY:
            continue
        for i in range(relation.get_n_targets()):
            text = relation.get_target(i).get_text_iface()
            if text is not None:
                name += Atspi.Text.get_text(text, 0, -1)
    return name


def showing(node):
    states = node.get_state_set()
    return states.contains(Atspi.StateType.SHOWING)


def walk(root):
    """The showing elements under root, depth first."""
    stack, seen = [root], 0
    while stack and seen < MAX_NODES:
        node = stack.pop()
        seen += 1
        yield node
        try:
            count = node.get_child_count()
        except gi.repository.GLib.Error:
            continue
        children = []
        for i in range(count):
            child = node.get_child_at_index(i)
            if child is not None and showing(child):
                children.append(child)
        stack.extend(reversed(children))


def matcher(request):
    name, how = request["name"], request.get("match", "exact")
    if how == "prefix":
        return lambda n: n.startswith(name)
    if how == "regex":
        pattern = re.compile(name)
        return lambda n: pattern.search(n) is not None
    return lambda n: n == name


def describe(node):
    states = node.get_state_set()
    return {
        "name": name_of(node),
        "role": node.get_role_name(),
        "enabled": states.contains(Atspi.StateType.ENABLED)
        and states.contains(Atspi.StateType.SENSITIVE),
        "selected": states.contains(Atspi.StateType.SELECTED),
        "checked": states.contains(Atspi.StateType.CHECKED)
        or states.contains(Atspi.StateType.PRESSED),
    }


def find(request):
    app = application(request["app"])
    if app is None:
        return None
    matches = matcher(request)
    role = request.get("role")
    for node in walk(app):
        name = name_of(node)
        if name and matches(name) and (role is None or node.get_role_name() == role):
            return node
    return None


def focused_text(app):
    for node in walk(app):
        states = node.get_state_set()
        if states.contains(Atspi.StateType.FOCUSED) and node.get_editable_text_iface():
            return node
    return None


def type_text(request):
    app = application(request["app"])
    node = focused_text(app) if app else None
    if node is None:
        raise RuntimeError("no text field has focus")
    editable = node.get_editable_text_iface()
    if not Atspi.EditableText.set_text_contents(editable, request["text"]):
        raise RuntimeError("the text field refused the text")
    # A field still settling (React setting its initial value) can replace
    # the text again: check it stuck, so the caller can retry.
    time.sleep(0.3)
    text = node.get_text_iface()
    now = Atspi.Text.get_text(text, 0, -1) if text else None
    if now != request["text"]:
        raise RuntimeError(f"the text field shows {now!r}, not {request['text']!r}")


def send_key(request):
    keysym = KEYSYMS[request["key"]]
    Atspi.generate_keyboard_event(keysym, None, Atspi.KeySynthType.SYM)


def press(node):
    action = node.get_action_iface()
    if action is None:
        raise RuntimeError(f"{name_of(node)!r} has no actions")
    names = [Atspi.Action.get_action_name(action, i) for i in range(action.get_n_actions())]
    for wanted in ("a11y.activate", "click", "activate", "press"):
        if wanted in names:
            action.do_action(names.index(wanted))
            return
    raise RuntimeError(f"{name_of(node)!r} can't be pressed (actions: {names})")


def double_click(node):
    # Synthesized (XTest) mouse clicks at the element's extents don't reach
    # the app's rows in the test session, so activate it twice, a moment
    # apart, as a hand double-clicks.
    press(node)
    time.sleep(0.12)
    press(node)


def handle(request):
    op = request["op"]
    if op == "find":
        node = find(request)
        return {"element": describe(node) if node else None}
    if op == "press":
        node = find(request)
        if node is None:
            raise RuntimeError(f"no element named {request['name']!r}")
        press(node)
        return {}
    if op == "doubleClick":
        node = find(request)
        if node is None:
            raise RuntimeError(f"no element named {request['name']!r}")
        double_click(node)
        return {}
    if op == "type":
        type_text(request)
        return {}
    if op == "key":
        send_key(request)
        return {}
    if op == "names":
        app = application(request["app"])
        if app is None:
            return {"names": []}
        return {
            "names": [
                f"{n.get_role_name()}: {name_of(n)}" for n in walk(app) if name_of(n)
            ]
        }
    raise RuntimeError(f"unknown op {op!r}")


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            reply = {"ok": True, **handle(json.loads(line))}
        except Exception as e:  # noqa: BLE001 - every failure goes back to the test
            reply = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        print(json.dumps(reply), flush=True)


if __name__ == "__main__":
    main()

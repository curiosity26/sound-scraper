// Project rules that ESLint's selectors can't express on their own.
const STATE_HOOKS = new Set(['useState', 'useReducer'])
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect'])

const hookName = call => {
  const callee = call.callee
  if (callee.type === 'Identifier') return callee.name
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name
  return undefined
}

const isFunction = node =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

// `const Name: FC<…> = props => …` or a generic `const Name = <T,>(…) => …`.
const componentName = fn => {
  const parent = fn.parent
  if (
    fn.type === 'ArrowFunctionExpression' &&
    parent.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier' &&
    /^[A-Z]/.test(parent.id.name)
  )
    return parent.id.name
  return undefined
}

const maxComponentHooks = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Limit the state and effect hooks a component calls directly; past that, move the logic into a use<Domain> hook.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          state: { type: 'integer', minimum: 0 },
          effects: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { state = 2, effects = 1 } = context.options[0] ?? {}
    const stack = []
    return {
      ':function'(node) {
        stack.push({ node, name: componentName(node), state: 0, effects: 0 })
      },
      CallExpression(call) {
        const name = hookName(call)
        const top = stack[stack.length - 1]
        if (!name || !top || !top.name) return
        if (STATE_HOOKS.has(name)) top.state += 1
        if (EFFECT_HOOKS.has(name)) top.effects += 1
      },
      ':function:exit'(node) {
        const top = stack.pop()
        if (!top.name) return
        const parts = []
        if (top.state > state)
          parts.push(`${top.state} useState/useReducer (max ${state})`)
        if (top.effects > effects)
          parts.push(
            `${top.effects} useEffect/useLayoutEffect (max ${effects})`,
          )
        if (parts.length > 0)
          context.report({
            node,
            message: `${top.name} calls ${parts.join(
              ' and ',
            )}. Move its state and effects into a use<Domain> hook that returns a typed Result.`,
          })
      },
    }
  },
}

// An effect that awaits a promise and then stores the result is a manual
// loading state; read the data with use() under <Suspense> instead.
const noEffectFetch = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Read async data with use() and <Suspense>, not an effect that sets state when a promise settles.',
    },
    schema: [],
  },
  create(context) {
    const inAsyncCallback = (node, effectFn) => {
      for (let n = node.parent; n && n !== effectFn; n = n.parent) {
        if (!isFunction(n)) continue
        if (n.async) return true
        const call = n.parent
        if (
          call.type === 'CallExpression' &&
          call.arguments.includes(n) &&
          call.callee.type === 'MemberExpression' &&
          call.callee.property.type === 'Identifier' &&
          /^(then|catch|finally)$/.test(call.callee.property.name)
        )
          return true
      }
      return false
    }
    return {
      CallExpression(call) {
        const name = hookName(call)
        if (!EFFECT_HOOKS.has(name)) return
        const effectFn = call.arguments[0]
        if (!effectFn || !isFunction(effectFn)) return
        const found = []
        const visit = node => {
          if (!node || typeof node.type !== 'string') return
          if (
            node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            /^set[A-Z]/.test(node.callee.name) &&
            inAsyncCallback(node, effectFn)
          )
            found.push(node)
          for (const key of Object.keys(node)) {
            if (key === 'parent') continue
            const value = node[key]
            if (Array.isArray(value)) value.forEach(visit)
            else if (value && typeof value.type === 'string') visit(value)
          }
        }
        visit(effectFn.body)
        if (found.length > 0)
          context.report({
            node: call,
            message:
              'This effect stores the result of a promise in state. Read it with use() under <Suspense> and an ErrorBoundary, with the promise from a cache.',
          })
      },
    }
  },
}

// `unknown` is for values whose shape isn't known yet: a type guard's
// input (`(value: unknown): value is X`) and caught errors. Anywhere else a
// type should say what the data is.
const noUnknownShape = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Allow `unknown` only as a type guard parameter or a caught error.',
    },
    schema: [],
  },
  create(context) {
    const isGuard = fn =>
      fn.returnType?.typeAnnotation.type === 'TSTypePredicate'
    const allowed = node => {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === 'CatchClause') return true
        if (isFunction(n) || n.type === 'TSFunctionType') {
          return isGuard(n) && n.params.some(p => within(node, p))
        }
      }
      return false
    }
    const within = (node, ancestor) => {
      for (let n = node; n; n = n.parent) if (n === ancestor) return true
      return false
    }
    return {
      TSUnknownKeyword(node) {
        if (!allowed(node))
          context.report({
            node,
            message:
              "Say what the data is: use the generated bridge types (src/native/bridge) or a domain type, and narrow input with a type guard. `unknown` is only for a guard's parameter or a caught error.",
          })
      },
    }
  },
}

module.exports = {
  rules: {
    'no-unknown-shape': noUnknownShape,
    'max-component-hooks': maxComponentHooks,
    'no-effect-fetch': noEffectFetch,
  },
}

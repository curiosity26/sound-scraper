/** Google Tag Manager container for Google Analytics. */
export const googleTagId = 'GTM-5LXFXXCB'

/** Production builds only, so `astro dev` doesn't count as visits. */
export const googleTagEnabled = import.meta.env.PROD

/** Where a visitor's analytics choice is kept ('granted' or 'denied'). */
export const consentKey = 'sound-scraper-analytics-consent'

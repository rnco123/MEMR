/**
 * Parse device / browser / OS info from a User-Agent string.
 * Used server-side when creating a support ticket.
 */

export interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop'
  browser: string
  os: string
}

export function parseDeviceInfo(userAgent: string): DeviceInfo {
  const ua = userAgent || ''

  // Device type
  let device_type: 'mobile' | 'tablet' | 'desktop' = 'desktop'
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device_type = 'tablet'
  } else if (
    /mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop|windows phone/i.test(ua)
  ) {
    device_type = 'mobile'
  }

  // OS
  let os = 'Unknown OS'
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11'
  else if (/windows nt 6\.3/i.test(ua)) os = 'Windows 8.1'
  else if (/windows nt 6\.2/i.test(ua)) os = 'Windows 8'
  else if (/windows nt 6\.1/i.test(ua)) os = 'Windows 7'
  else if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os x/i.test(ua)) {
    const match = ua.match(/mac os x ([\d_]+)/i)
    const version = match?.[1]?.replace(/_/g, '.') ?? ''
    os = version ? `macOS ${version}` : 'macOS'
  } else if (/iphone os/i.test(ua)) {
    const match = ua.match(/iphone os ([\d_]+)/i)
    const version = match?.[1]?.replace(/_/g, '.') ?? ''
    os = version ? `iOS ${version}` : 'iOS'
  } else if (/android/i.test(ua)) {
    const match = ua.match(/android ([\d.]+)/i)
    const version = match?.[1] ?? ''
    os = version ? `Android ${version}` : 'Android'
  } else if (/linux/i.test(ua)) os = 'Linux'
  else if (/cros/i.test(ua)) os = 'ChromeOS'

  // Browser
  let browser = 'Unknown Browser'
  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/([\d.]+)/i)
    browser = `Edge ${match?.[1] ?? ''}`
  } else if (/opr\//i.test(ua) || /opera/i.test(ua)) {
    const match = ua.match(/opr\/([\d.]+)/i) || ua.match(/opera\/([\d.]+)/i)
    browser = `Opera ${match?.[1] ?? ''}`
  } else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) {
    const match = ua.match(/chrome\/([\d.]+)/i)
    browser = `Chrome ${match?.[1] ?? ''}`
  } else if (/firefox\//i.test(ua)) {
    const match = ua.match(/firefox\/([\d.]+)/i)
    browser = `Firefox ${match?.[1] ?? ''}`
  } else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) {
    const match = ua.match(/version\/([\d.]+)/i)
    browser = `Safari ${match?.[1] ?? ''}`
  } else if (/trident|msie/i.test(ua)) {
    browser = 'Internet Explorer'
  }

  return { device_type, browser, os }
}

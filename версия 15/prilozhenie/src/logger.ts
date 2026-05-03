export function log(action: string, details: any = {}) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${action}`, details);
}

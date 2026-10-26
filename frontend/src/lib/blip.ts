/** Posición estable (0-1) de un blip de radar según el nombre de la tabla. */
export function blip(name: string, salt: number): number {
  let h = salt
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997
  return 0.18 + (h / 997) * 0.64
}

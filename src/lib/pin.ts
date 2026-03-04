export function getPin(groupId: string) {
  return localStorage.getItem(`pin:${groupId}`) || "";
}

export function setPin(groupId: string, pin: string) {
  localStorage.setItem(`pin:${groupId}`, pin);
}
export function notifyDataChanged(): void {
  window.dispatchEvent(new Event("onego:data-changed"));
}

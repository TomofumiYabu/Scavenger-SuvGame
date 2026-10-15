const paths: Record<string, string> = {
  ruins:
    '<path d="M5 21V10l6-5v16m0-14 8 3v11M3 21h19M7 12h1m-1 4h1m6-4h2m-2 4h2M15 5l2-3 3 4"/>',
  street: '<path d="m8 3-4 18m12-18 4 18M12 3v3m0 4v3m0 4v4"/>',
  park: '<path d="m8 3-5 8h3l-4 6h12l-4-6h3ZM8 17v5m9-17-3 6h2l-3 6h8l-3-6h2ZM17 17v5"/>',
  clinic:
    '<path d="M4 21V7h16v14M2 21h20M9 21v-5h6v5m-3-11v4m-2-2h4M9 7V3h6v4"/>',
  shelter: '<path d="m2 12 10-9 10 9M5 10v11h14V10M10 21v-7h4v7"/>',
  tower:
    '<path d="m6 22 6-16 6 16M9 15h6M7 20h10M12 6V2M6 3a9 9 0 0 0-2 10M18 3a9 9 0 0 1 2 10M8 5a5 5 0 0 0-1 5m9-5a5 5 0 0 1 1 5"/>',
  water:
    '<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  food: '<path d="M5 5h14v16H5zM4 5h16M7 2h10M8 10h8m-8 4h8m-8 3h4"/>',
  bandage:
    '<path d="m3 14 11-11a3 3 0 0 1 4 0l3 3a3 3 0 0 1 0 4L10 21a3 3 0 0 1-4 0l-3-3a3 3 0 0 1 0-4Z"/><path d="m8 9 7 7m-6-8 7 7m-6-3h.01m3 0h.01"/>',
  scrap: '<path d="m13 3 7 2-2 7-5-1-7 10-4-4 10-7Z"/>',
  health:
    '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 2 11 8 15 6-4 13-10 8-15Z"/><path d="M5 11h4l2-3 2 7 2-4h4"/>',
  energy: '<path d="m14 2-9 12h6l-1 8 9-12h-6Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  rest: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  location:
    '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  pack: '<path d="M6 8h12a2 2 0 0 1 2 2v11H4V10a2 2 0 0 1 2-2ZM8 8V5a4 4 0 0 1 8 0v3M8 13h8v5H8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
};
export function icon(name: string, className = ""): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.location}</svg>`;
}

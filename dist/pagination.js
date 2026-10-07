export const PAGE_SIZE = 10;

export function paginate(items, requestedPage = 1) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  return { currentPage, totalPages, offset, rows: items.slice(offset, offset + PAGE_SIZE) };
}

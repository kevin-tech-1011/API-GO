/**
 * `pagination.className` for in-panel Ant Design `Table` footers.
 * - `!m-0` overrides Ant Design’s default vertical margin on `.ant-table-pagination`.
 * - Horizontal + vertical padding matches History / Schedule spacing.
 *
 * Do **not** use on the Statistics page table — that view keeps its own pagination chrome.
 */
export const TABLE_PAGINATION_COMFORT_CLASSNAME =
    '!m-0 !px-2 !py-3 sm:!px-4' as const

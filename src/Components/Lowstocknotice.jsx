// Low stock notice, shared by Inventory - Products and Inventory - Raw Materials.

const RED = "#B3211B";
const AMBER = "#A15C07";
const RED_SOFT = "#FBEAEA";
const AMBER_SOFT = "#FBF3E8";

function LowStockNotice({ title, subtitle, items, moreCount = 0 }) {
  if (!items || items.length === 0) return null;

  const hasOut = items.some((i) => i.out);

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: hasOut ? "#F1D4D2" : "#E9DCCB" }}
    >
      

      <div className="px-5 py-4 pl-6">
        {/* Header */}
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}

        {/* Items */}
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-100">
          <ul className="divide-y divide-gray-100">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-4 bg-white px-3.5 py-2.5 transition-colors hover:bg-gray-50"
              >
                <p className="min-w-0 truncate text-sm font-medium text-gray-700">{i.name}</p>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="rounded-3xl px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      backgroundColor: i.out ? RED_SOFT : AMBER_SOFT,
                      color: i.out ? RED : AMBER,
                    }}
                  >
                    {i.out ? "Out of stock" : "Low"}
                  </span>
                  <span
                    className="min-w-[56px] text-right text-sm font-semibold"
                    style={{ color: i.out ? RED : AMBER }}
                  >
                    {i.qty}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* More items */}
        {moreCount > 0 && (
          <p className="mt-2.5 text-xs text-gray-400">
            and {moreCount} more item{moreCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export default LowStockNotice;
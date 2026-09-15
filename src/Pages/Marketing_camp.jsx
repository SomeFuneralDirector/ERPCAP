import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";

/* ── Design tokens — shared with Inventory / Sales / Marketing dashboards ─ */
const C = {
  accent: "#B3211B",
  accentHover: "#8E1A15",
  accentSoft: "#FBEAE9",
  accentSoftBorder: "#F3C9C7",
  text: "#1C1C1F",
  textMuted: "#6B6B70",
  border: "#E4E4E7",
  success: "#15803D",
  successSoft: "#EEF6EF",
  warning: "#A15C07",
  warningSoft: "#FBF3E7",
  warningBorder: "#F1DDB8",
};

const PLATFORM_COLORS = {
  Shopee: "#EE4D2D",
  Lazada: "#0F146D",
  TikTok: "#101113",
  "All Platforms": C.accent,
};

const ACTIVE_STATUSES = ["Upcoming", "Active"];
const HISTORY_STATUSES = ["Ended", "Cancelled"];

const STATUS_STYLES = {
  Upcoming: {
    color: C.warning,
    backgroundColor: C.warningSoft,
    borderColor: C.warningBorder,
  },
  Active: {
    color: C.accent,
    backgroundColor: C.accentSoft,
    borderColor: C.accentSoftBorder,
  },
  Ended: {
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  Cancelled: {
    color: "#9CA3AF",
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
};

const DISCOUNT_TYPES = [
  "Percentage Off",
  "Fixed Amount Off",
  "Free Shipping",
  "Buy 1 Take 1",
  "Bundle Deal",
];

const VALUE_LESS_TYPES = ["Free Shipping", "Buy 1 Take 1"];

const inputBase =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-colors";

function emptyForm() {
  return {
    name: "",
    platform: "Shopee",
    discount_type: "Percentage Off",
    discount_value: "",
    start_date: "",
    end_date: "",
    notes: "",
  };
}

function formatDiscount(campaign) {
  if (VALUE_LESS_TYPES.includes(campaign.discount_type)) return campaign.discount_type;
  if (campaign.discount_type === "Percentage Off") return `${campaign.discount_value}% Off`;
  if (campaign.discount_type === "Fixed Amount Off") return `₱${campaign.discount_value} Off`;
  return campaign.discount_type;
}

// Status is derived from start_date/end_date — the only manual override is Cancelled.
function deriveStatus(campaign) {
  if (campaign.status === "Cancelled") return "Cancelled";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = campaign.start_date ? new Date(campaign.start_date) : null;
  const end = campaign.end_date ? new Date(campaign.end_date) : null;

  if (end) end.setHours(23, 59, 59, 999);
  if (end && today > end) return "Ended";
  if (start && today < start) return "Upcoming";
  return "Active";
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer ${className}`}
      style={{ backgroundColor: C.accent }}
      onMouseEnter={(e) => {
        if (!props.disabled) e.currentTarget.style.backgroundColor = C.accentHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = C.accent;
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.Ended;
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${
        status === "Cancelled" ? "line-through" : ""
      }`}
      style={style}
    >
      {status}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const color = PLATFORM_COLORS[platform] || "#6B7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
      <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: color }} />
      {platform}
    </span>
  );
}

function focusRing(e) {
  e.target.style.boxShadow = `0 0 0 3px ${C.accentSoft}`;
  e.target.style.borderColor = C.accent;
}

function blurRing(e) {
  e.target.style.boxShadow = "none";
  e.target.style.borderColor = "#D1D5DB";
}

function Marketing_campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [viewCampaign, setViewCampaign] = useState(null);

  const fetchCampaigns = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setErrorMsg("");

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setCampaigns(data || []);
    }
    setInitialLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchCampaigns(true);

    const channel = supabase
      .channel("campaigns-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaigns" },
        () => fetchCampaigns(false)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchCampaigns]);

  function openCreateForm() {
    setFormData(emptyForm());
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormData(emptyForm());
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreateCampaign(e) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");

    const payload = {
      name: formData.name,
      platform: formData.platform,
      discount_type: formData.discount_type,
      discount_value: VALUE_LESS_TYPES.includes(formData.discount_type)
        ? null
        : Number(formData.discount_value) || 0,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      notes: formData.notes || null,
      status: "Active",
    };

    const { error } = await supabase.from("campaigns").insert([payload]);

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    closeForm();
    fetchCampaigns(false);
  }

  async function handleCancel(campaign) {
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "Cancelled" })
      .eq("id", campaign.id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, status: "Cancelled" } : c))
    );

    if (viewCampaign && viewCampaign.id === campaign.id) {
      setViewCampaign((prev) => ({ ...prev, status: "Cancelled" }));
    }
  }

  async function handleReactivate(campaign) {
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "Active" })
      .eq("id", campaign.id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, status: "Active" } : c))
    );

    if (viewCampaign && viewCampaign.id === campaign.id) {
      setViewCampaign((prev) => ({ ...prev, status: "Active" }));
    }
  }

  async function handleNotesUpdate(campaign, notes) {
    const { error } = await supabase
      .from("campaigns")
      .update({ notes })
      .eq("id", campaign.id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, notes } : c))
    );
  }

  const activeCampaigns = campaigns.filter((c) =>
    ACTIVE_STATUSES.includes(deriveStatus(c))
  );
  const historyCampaigns = campaigns.filter((c) =>
    HISTORY_STATUSES.includes(deriveStatus(c))
  );
  const displayedCampaigns = activeTab === "active" ? activeCampaigns : historyCampaigns;
  const loading = initialLoading;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F6F7" }}>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <Card className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Marketing - Campaigns</h1>
            {refreshing && <p className="text-xs text-gray-400 mt-0.5">Syncing…</p>}
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <PrimaryButton onClick={openCreateForm}>+ New Campaign</PrimaryButton>
            <SecondaryButton
              onClick={() => fetchCampaigns(false)}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? "Loading…" : "Refresh"}
            </SecondaryButton>
          </div>
        </Card>

        {errorMsg && (
          <div
            className="rounded-md border px-3 py-2.5 text-xs"
            style={{
              backgroundColor: C.accentSoft,
              borderColor: C.accentSoftBorder,
              color: C.accent,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Table card */}
        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="px-5 pt-4 flex gap-1 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === "active"
                  ? "border-transparent text-white"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={
                activeTab === "active"
                  ? {
                      borderBottomColor: C.accent,
                      color: C.accent,
                    }
                  : undefined
              }
            >
              Active Promotions ({activeCampaigns.length})
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === "history"
                  ? "border-transparent"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={
                activeTab === "history"
                  ? {
                      borderBottomColor: C.accent,
                      color: C.accent,
                    }
                  : undefined
              }
            >
              Campaign History ({historyCampaigns.length})
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : displayedCampaigns.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">
              No {activeTab === "active" ? "active or upcoming" : "ended or cancelled"}{" "}
              campaigns yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-red-900 text-white">
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">CAMPAIGN</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">PLATFORM</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">OFFER</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">START</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">END</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">STATUS</th>
                    <th className="px-5 py-2.5 text-xs font-semibold tracking-wide">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCampaigns.map((c) => {
                    const status = deriveStatus(c);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                        <td className="px-5 py-3">
                          <PlatformBadge platform={c.platform} />
                        </td>
                        <td className="px-5 py-3 text-gray-600">{formatDiscount(c)}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {c.start_date
                            ? new Date(c.start_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-600">
                          {c.end_date
                            ? new Date(c.end_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={status} />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setViewCampaign(c)}
                              className="text-xs font-medium cursor-pointer hover:underline"
                              style={{ color: C.accent }}
                            >
                              View
                            </button>
                            {status === "Cancelled" ? (
                              <button
                                onClick={() => handleReactivate(c)}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                              >
                                Reactivate
                              </button>
                            ) : status !== "Ended" ? (
                              <button
                                onClick={() => handleCancel(c)}
                                className="text-xs font-medium text-gray-400 hover:underline cursor-pointer"
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.color = C.accent)
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.color = "")
                                }
                              >
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Create Campaign Modal */}
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">New Campaign</h2>
                <button
                  onClick={closeForm}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer text-sm font-semibold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateCampaign}>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Campaign Name <span style={{ color: C.accent }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="e.g. 8.8 Mega Sale"
                      className={inputBase}
                      onFocus={focusRing}
                      onBlur={blurRing}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Platform
                      </label>
                      <select
                        name="platform"
                        value={formData.platform}
                        onChange={handleFormChange}
                        className={`${inputBase} cursor-pointer`}
                      >
                        <option value="Shopee">Shopee</option>
                        <option value="Lazada">Lazada</option>
                        <option value="TikTok">TikTok</option>
                        <option value="All Platforms">All Platforms</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Offer Type
                      </label>
                      <select
                        name="discount_type"
                        value={formData.discount_type}
                        onChange={handleFormChange}
                        className={`${inputBase} cursor-pointer`}
                      >
                        {DISCOUNT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!VALUE_LESS_TYPES.includes(formData.discount_type) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {formData.discount_type === "Percentage Off"
                          ? "Discount (%)"
                          : "Discount Amount (₱)"}{" "}
                        <span style={{ color: C.accent }}>*</span>
                      </label>
                      <input
                        type="number"
                        name="discount_value"
                        min="0"
                        value={formData.discount_value}
                        onChange={handleFormChange}
                        className={inputBase}
                        onFocus={focusRing}
                        onBlur={blurRing}
                        required
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        name="start_date"
                        value={formData.start_date}
                        onChange={handleFormChange}
                        className={`${inputBase} cursor-pointer`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        name="end_date"
                        value={formData.end_date}
                        onChange={handleFormChange}
                        className={`${inputBase} cursor-pointer`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Promotional Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      rows={3}
                      placeholder="Internal notes — target audience, creative direction, budget, etc."
                      className={inputBase}
                      onFocus={focusRing}
                      onBlur={blurRing}
                    />
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
                  <SecondaryButton type="button" onClick={closeForm}>
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Create Campaign"}
                  </PrimaryButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View / Detail Modal */}
        {viewCampaign && (
          <ViewCampaignModal
            campaign={viewCampaign}
            onClose={() => setViewCampaign(null)}
            onCancel={handleCancel}
            onReactivate={handleReactivate}
            onNotesUpdate={handleNotesUpdate}
          />
        )}
      </div>
    </div>
  );
}

function ViewCampaignModal({ campaign, onClose, onCancel, onReactivate, onNotesUpdate }) {
  const [notesDraft, setNotesDraft] = useState(campaign.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const status = deriveStatus(campaign);

  useEffect(() => {
    setNotesDraft(campaign.notes || "");
  }, [campaign.id, campaign.notes]);

  async function saveNotes() {
    setSavingNotes(true);
    await onNotesUpdate(campaign, notesDraft);
    setSavingNotes(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</h2>
            <StatusBadge status={status} />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer text-sm font-semibold shrink-0 ml-2"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <dl className="text-sm space-y-3">
            <div className="flex justify-between items-center">
              <dt className="text-xs text-gray-500">Platform</dt>
              <dd>
                <PlatformBadge platform={campaign.platform} />
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-xs text-gray-500">Offer</dt>
              <dd className="text-gray-800 font-medium">{formatDiscount(campaign)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-xs text-gray-500">Start Date</dt>
              <dd className="text-gray-800">
                {campaign.start_date
                  ? new Date(campaign.start_date).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-xs text-gray-500">End Date</dt>
              <dd className="text-gray-800">
                {campaign.end_date
                  ? new Date(campaign.end_date).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
          </dl>

          {status === "Cancelled" ? (
            <button
              onClick={() => onReactivate(campaign)}
              className="w-full px-3 py-2 rounded-md text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Reactivate Campaign
            </button>
          ) : status !== "Ended" ? (
            <button
              onClick={() => onCancel(campaign)}
              className="w-full px-3 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer"
              style={{
                color: C.accent,
                borderColor: C.accentSoftBorder,
                backgroundColor: C.accentSoft,
              }}
            >
              Cancel Campaign
            </button>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Promotional Notes
            </label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Internal notes — target audience, creative direction, budget, etc."
              className={inputBase}
              onFocus={focusRing}
              onBlur={blurRing}
            />
            {notesDraft !== (campaign.notes || "") && (
              <PrimaryButton
                onClick={saveNotes}
                disabled={savingNotes}
                className="mt-2"
              >
                {savingNotes ? "Saving…" : "Save Notes"}
              </PrimaryButton>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex justify-end">
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

export default Marketing_campaigns;
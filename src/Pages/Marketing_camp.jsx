import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../api/supabase'

const ACTIVE_STATUSES = ['Upcoming', 'Active']
const HISTORY_STATUSES = ['Ended', 'Cancelled']

const STATUS_STYLES = {
  Upcoming: 'bg-white text-red-600 border border-red-300',
  Active: 'bg-red-500 text-white',
  Ended: 'bg-gray-100 text-gray-600 border border-gray-300',
  Cancelled: 'bg-gray-100 text-gray-400 border border-gray-300 line-through',
}

const PLATFORM_STYLES = {
  Shopee: 'bg-orange-100 text-orange-600 border border-orange-300',
  Lazada: 'bg-blue-100 text-blue-600 border border-blue-300',
  TikTok: 'bg-gray-800 text-white',
  'All Platforms': 'bg-red-100 text-red-600 border border-red-300',
}

const DISCOUNT_TYPES = [
  'Percentage Off',
  'Fixed Amount Off',
  'Free Shipping',
  'Buy 1 Take 1',
  'Bundle Deal',
]

const VALUE_LESS_TYPES = ['Free Shipping', 'Buy 1 Take 1']

function emptyForm() {
  return {
    name: '',
    platform: 'Shopee',
    discount_type: 'Percentage Off',
    discount_value: '',
    start_date: '',
    end_date: '',
    notes: '',
  }
}

function formatDiscount(campaign) {
  if (VALUE_LESS_TYPES.includes(campaign.discount_type)) return campaign.discount_type
  if (campaign.discount_type === 'Percentage Off') return `${campaign.discount_value}% Off`
  if (campaign.discount_type === 'Fixed Amount Off') return `₱${campaign.discount_value} Off`
  return campaign.discount_type
}

// Status is derived from start_date/end_date — the only manual override is Cancelled.
function deriveStatus(campaign) {
  if (campaign.status === 'Cancelled') return 'Cancelled'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = campaign.start_date ? new Date(campaign.start_date) : null
  const end = campaign.end_date ? new Date(campaign.end_date) : null

  if (end && today > end) return 'Ended'
  if (start && today < start) return 'Upcoming'
  return 'Active'
}

function Marketing_campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeTab, setActiveTab] = useState('active')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const [viewCampaign, setViewCampaign] = useState(null)

  const fetchCampaigns = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }
    setErrorMsg('')

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
    } else {
      setCampaigns(data || [])
    }
    setInitialLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    fetchCampaigns(true)

    const channel = supabase
      .channel('campaigns-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns' },
        () => fetchCampaigns(false)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchCampaigns])

  function openCreateForm() {
    setFormData(emptyForm())
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setFormData(emptyForm())
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleCreateCampaign(e) {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')

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
      status: 'Active',
    }

    const { error } = await supabase.from('campaigns').insert([payload])

    setSaving(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    closeForm()
    fetchCampaigns(false)
  }

  async function handleCancel(campaign) {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'Cancelled' })
      .eq('id', campaign.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, status: 'Cancelled' } : c))
    )

    if (viewCampaign && viewCampaign.id === campaign.id) {
      setViewCampaign((prev) => ({ ...prev, status: 'Cancelled' }))
    }
  }

  async function handleReactivate(campaign) {
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'Active' })
      .eq('id', campaign.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, status: 'Active' } : c))
    )

    if (viewCampaign && viewCampaign.id === campaign.id) {
      setViewCampaign((prev) => ({ ...prev, status: 'Active' }))
    }
  }

  async function handleNotesUpdate(campaign, notes) {
    const { error } = await supabase
      .from('campaigns')
      .update({ notes })
      .eq('id', campaign.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaign.id ? { ...c, notes } : c))
    )
  }

  const activeCampaigns = campaigns.filter((c) => ACTIVE_STATUSES.includes(deriveStatus(c)))
  const historyCampaigns = campaigns.filter((c) => HISTORY_STATUSES.includes(deriveStatus(c)))
  const displayedCampaigns = activeTab === 'active' ? activeCampaigns : historyCampaigns
  const loading = initialLoading

  return (
    <div className="p-6">
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Marketing - Campaigns
          </h1>
          {refreshing && <p className="text-xs text-gray-400 mt-1">Syncing…</p>}
        </div>
        <button
          onClick={openCreateForm}
          className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg shadow transition cursor-pointer"
        >
         New Campaign
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {errorMsg}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 ">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 ">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 cursor-pointer font-semibold text-sm  border-b-2 transition ${
              activeTab === 'active'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            Active Promotions ({activeCampaigns.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-semibold cursor-pointer text-sm border-b-2 transition ${
              activeTab === 'history'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            Campaign History ({historyCampaigns.length})
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading campaigns...</p>
        ) : displayedCampaigns.length === 0 ? (
          <p className="text-gray-400 text-sm italic">
            No {activeTab === 'active' ? 'active or upcoming' : 'ended or cancelled'} campaigns yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4">Campaign</th>
                  <th className="py-2 pr-4">Platform</th>
                  <th className="py-2 pr-4">Offer</th>
                  <th className="py-2 pr-4">Start</th>
                  <th className="py-2 pr-4">End</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedCampaigns.map((c) => {
                  const status = deriveStatus(c)
                  return (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-red-50/40"
                  >
                    <td className="py-2 pr-4 font-medium text-gray-700">{c.name}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          PLATFORM_STYLES[c.platform] || 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {c.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{formatDiscount(c)}</td>
                    <td className="py-2 pr-4">
                      {c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          STATUS_STYLES[status] || ''
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewCampaign(c)}
                          className="text-red-600 hover:underline text-xs font-semibold"
                        >
                          View
                        </button>
                        {status === 'Cancelled' ? (
                          <button
                            onClick={() => handleReactivate(c)}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-700 hover:underline"
                          >
                            Reactivate
                          </button>
                        ) : status !== 'Ended' ? (
                          <button
                            onClick={() => handleCancel(c)}
                            className="text-xs font-semibold text-gray-400 hover:text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              New Campaign
            </h2>
            <form onSubmit={handleCreateCampaign} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g. 8.8 Mega Sale"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Platform
                  </label>
                  <select
                    name="platform"
                    value={formData.platform}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  >
                    <option value="Shopee">Shopee</option>
                    <option value="Lazada">Lazada</option>
                    <option value="TikTok">TikTok</option>
                    <option value="All Platforms">All Platforms</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Offer Type
                  </label>
                  <select
                    name="discount_type"
                    value={formData.discount_type}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {formData.discount_type === 'Percentage Off'
                      ? 'Discount (%)'
                      : 'Discount Amount (₱)'}
                  </label>
                  <input
                    type="number"
                    name="discount_value"
                    min="0"
                    value={formData.discount_value}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Promotional Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Internal notes — target audience, creative direction, budget, etc."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Campaign'}
                </button>
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
  )
}

function ViewCampaignModal({ campaign, onClose, onCancel, onReactivate, onNotesUpdate }) {
  const [notesDraft, setNotesDraft] = useState(campaign.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const status = deriveStatus(campaign)

  useEffect(() => {
    setNotesDraft(campaign.notes || '')
  }, [campaign.id, campaign.notes])

  async function saveNotes() {
    setSavingNotes(true)
    await onNotesUpdate(campaign, notesDraft)
    setSavingNotes(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">{campaign.name}</h2>
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              STATUS_STYLES[status] || ''
            }`}
          >
            {status}
          </span>
        </div>

        <dl className="text-sm text-gray-600 space-y-2 mb-4">
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-500">Platform</dt>
            <dd>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  PLATFORM_STYLES[campaign.platform] || ''
                }`}
              >
                {campaign.platform}
              </span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-500">Offer</dt>
            <dd>{formatDiscount(campaign)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-500">Start Date</dt>
            <dd>
              {campaign.start_date
                ? new Date(campaign.start_date).toLocaleDateString()
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-500">End Date</dt>
            <dd>
              {campaign.end_date
                ? new Date(campaign.end_date).toLocaleDateString()
                : '—'}
            </dd>
          </div>
        </dl>

        {status === 'Cancelled' ? (
          <div className="mb-4">
            <button
              onClick={() => onReactivate(campaign)}
              className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-300 hover:bg-gray-50"
            >
              Reactivate Campaign
            </button>
          </div>
        ) : status !== 'Ended' ? (
          <div className="mb-4">
            <button
              onClick={() => onCancel(campaign)}
              className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50"
            >
              Cancel Campaign
            </button>
          </div>
        ) : null}

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Promotional Notes
          </label>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={4}
            placeholder="Internal notes — target audience, creative direction, budget, etc."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          {notesDraft !== (campaign.notes || '') && (
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {savingNotes ? 'Saving...' : 'Save Notes'}
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default Marketing_campaigns
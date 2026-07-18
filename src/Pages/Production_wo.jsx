import React, { useState, useEffect } from 'react'
import { supabase } from '../api/supabase'

const STATUS_FLOW = ['Pending', 'In Progress', 'Completed', 'Cancelled']
const ACTIVE_STATUSES = ['Pending', 'In Progress']
const HISTORY_STATUSES = ['Completed', 'Cancelled']

const STATUS_STYLES = {
  Pending: 'bg-white text-red-600 border border-red-300',
  'In Progress': 'bg-red-500 text-white',
  Completed: 'bg-gray-100 text-gray-600 border border-gray-300',
  Cancelled: 'bg-gray-100 text-gray-400 border border-gray-300 line-through',
}

const PLATFORM_STYLES = {
  Shopee: 'bg-orange-100 text-orange-600 border border-orange-300',
  Lazada: 'bg-blue-100 text-blue-600 border border-blue-300',
  TikTok: 'bg-gray-800 text-white',
}

function emptyForm() {
  return {
    wo_number: '',
    product_name: '',
    quantity: '',
    platform: 'Shopee',
    assigned_to: '',
    due_date: '',
    notes: '',
  }
}

function Production_wo() {
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [activeTab, setActiveTab] = useState('active')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const [viewOrder, setViewOrder] = useState(null)

  useEffect(() => {
    fetchWorkOrders()
  }, [])

  async function fetchWorkOrders() {
    setLoading(true)
    setErrorMsg('')
    const { data, error } = await supabase
      .from('work_orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
    } else {
      setWorkOrders(data || [])
    }
    setLoading(false)
  }

  function generateWoNumber() {
    const stamp = Date.now().toString().slice(-6)
    return `WO-${stamp}`
  }

  function openCreateForm() {
    setFormData({ ...emptyForm(), wo_number: generateWoNumber() })
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

  async function handleCreateWorkOrder(e) {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')

    const payload = {
      wo_number: formData.wo_number,
      product_name: formData.product_name,
      quantity: Number(formData.quantity) || 0,
      platform: formData.platform,
      assigned_to: formData.assigned_to || null,
      due_date: formData.due_date || null,
      notes: formData.notes || null,
      status: 'Pending',
    }

    const { error } = await supabase.from('work_orders').insert([payload])

    setSaving(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    closeForm()
    fetchWorkOrders()
  }

  async function handleStatusChange(order, newStatus) {
    const updates = { status: newStatus }
    if (newStatus === 'Completed') {
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', order.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setWorkOrders((prev) =>
      prev.map((wo) => (wo.id === order.id ? { ...wo, ...updates } : wo))
    )

    if (viewOrder && viewOrder.id === order.id) {
      setViewOrder((prev) => ({ ...prev, ...updates }))
    }
  }

  const activeOrders = workOrders.filter((wo) =>
    ACTIVE_STATUSES.includes(wo.status)
  )
  const historyOrders = workOrders.filter((wo) =>
    HISTORY_STATUSES.includes(wo.status)
  )

  const displayedOrders = activeTab === 'active' ? activeOrders : historyOrders

  return (
    <div className="p-6">
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Production - Work Orders
        </h1>
        <button
          onClick={openCreateForm}
          className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg shadow transition"
        >
          + New Work Order
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {errorMsg}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
              activeTab === 'active'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            Active ({activeOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
              activeTab === 'history'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-red-500'
            }`}
          >
            History ({historyOrders.length})
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading work orders...</p>
        ) : displayedOrders.length === 0 ? (
          <p className="text-gray-400 text-sm italic">
            No {activeTab === 'active' ? 'active' : 'completed/cancelled'} work
            orders yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4">WO #</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Platform</th>
                  <th className="py-2 pr-4">Assigned To</th>
                  <th className="py-2 pr-4">Due Date</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedOrders.map((wo) => (
                  <tr
                    key={wo.id}
                    className="border-b border-gray-100 hover:bg-red-50/40"
                  >
                    <td className="py-2 pr-4 font-medium text-gray-700">
                      {wo.wo_number}
                    </td>
                    <td className="py-2 pr-4">{wo.product_name}</td>
                    <td className="py-2 pr-4">{wo.quantity}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          PLATFORM_STYLES[wo.platform] || 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {wo.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{wo.assigned_to || '—'}</td>
                    <td className="py-2 pr-4">
                      {wo.due_date
                        ? new Date(wo.due_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          STATUS_STYLES[wo.status] || ''
                        }`}
                      >
                        {wo.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewOrder(wo)}
                          className="text-red-600 hover:underline text-xs font-semibold"
                        >
                          View
                        </button>
                        {ACTIVE_STATUSES.includes(wo.status) && (
                          <select
                            value={wo.status}
                            onChange={(e) =>
                              handleStatusChange(wo, e.target.value)
                            }
                            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                          >
                            {STATUS_FLOW.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Work Order Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              New Work Order
            </h2>
            <form onSubmit={handleCreateWorkOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  WO Number
                </label>
                <input
                  type="text"
                  name="wo_number"
                  value={formData.wo_number}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Product
                </label>
                <input
                  type="text"
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    value={formData.quantity}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                    required
                  />
                </div>
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
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Assigned To
                  </label>
                  <input
                    type="text"
                    name="assigned_to"
                    value={formData.assigned_to}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows={3}
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
                  {saving ? 'Saving...' : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View / Status Detail Modal */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">
                {viewOrder.wo_number}
              </h2>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  STATUS_STYLES[viewOrder.status] || ''
                }`}
              >
                {viewOrder.status}
              </span>
            </div>

            <dl className="text-sm text-gray-600 space-y-2 mb-4">
              <div className="flex justify-between">
                <dt className="font-semibold text-gray-500">Product</dt>
                <dd>{viewOrder.product_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold text-gray-500">Quantity</dt>
                <dd>{viewOrder.quantity}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold text-gray-500">Platform</dt>
                <dd>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      PLATFORM_STYLES[viewOrder.platform] || 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {viewOrder.platform}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold text-gray-500">Assigned To</dt>
                <dd>{viewOrder.assigned_to || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-semibold text-gray-500">Due Date</dt>
                <dd>
                  {viewOrder.due_date
                    ? new Date(viewOrder.due_date).toLocaleDateString()
                    : '—'}
                </dd>
              </div>
              {viewOrder.notes && (
                <div>
                  <dt className="font-semibold text-gray-500 mb-1">Notes</dt>
                  <dd className="text-gray-700">{viewOrder.notes}</dd>
                </div>
              )}
            </dl>

            {ACTIVE_STATUSES.includes(viewOrder.status) && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Update Status
                </label>
                <select
                  value={viewOrder.status}
                  onChange={(e) =>
                    handleStatusChange(viewOrder, e.target.value)
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                >
                  {STATUS_FLOW.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setViewOrder(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Production_wo;
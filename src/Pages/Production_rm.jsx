import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../api/supabase'

const UNITS = ['pcs', 'kg', 'g', 'liters', 'ml', 'meters', 'rolls', 'sheets', 'boxes']
const STOCK_STATUSES = ['In Stock', 'Low Stock', 'Out of Stock']

function emptyForm() {
  return {
    material_name: '',
    category: '',
    unit: 'pcs',
    current_stock: '',
    supplier: '',
    unit_cost: '',
    notes: '',
  }
}

const STATUS_STYLES = {
  'In Stock': 'bg-green-100 text-green-700',
  'Low Stock': 'bg-amber-100 text-amber-700',
  'Out of Stock': 'bg-red-100 text-red-700',
}

function Production_rm() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchMaterials = useCallback(async () => {
    setErrorMsg('')

    const { data, error } = await supabase
      .from('raw_materials')
      .select('*')
      .order('material_name', { ascending: true })

    if (error) {
      setErrorMsg(error.message)
    } else {
      setMaterials(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMaterials()

    const channel = supabase
      .channel('raw-materials-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raw_materials' },
        () => fetchMaterials()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchMaterials])

  // ── Create / Edit ────────────────────────────────────────────

  function openCreateForm() {
    setEditingId(null)
    setFormData(emptyForm())
    setIsFormOpen(true)
  }

  function openEditForm(material) {
    setEditingId(material.id)
    setFormData({
      material_name: material.material_name || '',
      category: material.category || '',
      unit: material.unit || 'pcs',
      current_stock: material.current_stock ?? '',
      supplier: material.supplier || '',
      unit_cost: material.unit_cost ?? '',
      notes: material.notes || '',
    })
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingId(null)
    setFormData(emptyForm())
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')

    const payload = {
      material_name: formData.material_name,
      category: formData.category || null,
      unit: formData.unit,
      current_stock: Number(formData.current_stock) || 0,
      supplier: formData.supplier || null,
      unit_cost: formData.unit_cost ? Number(formData.unit_cost) : null,
      notes: formData.notes || null,
    }

    const { error } = editingId
      ? await supabase.from('raw_materials').update(payload).eq('id', editingId)
      : await supabase.from('raw_materials').insert([payload])

    setSaving(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    closeForm()
    fetchMaterials()
  }

  // ── Delete ───────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setErrorMsg('')

    const { error } = await supabase.from('raw_materials').delete().eq('id', deleteTarget.id)

    setDeleting(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setDeleteTarget(null)
    fetchMaterials()
  }

  // ── Inline status update ─────────────────────────────────────

  async function handleStatusChange(material, newStatus) {
    setErrorMsg('')

    const { error } = await supabase
      .from('raw_materials')
      .update({ status: newStatus })
      .eq('id', material.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setMaterials((prev) =>
      prev.map((m) => (m.id === material.id ? { ...m, status: newStatus } : m))
    )
  }

  // ── Derived ──────────────────────────────────────────────────

  const categories = useMemo(() => {
    const set = new Set(materials.map((m) => m.category).filter(Boolean))
    return Array.from(set).sort()
  }, [materials])

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase()
    return materials.filter((m) => {
      const matchesSearch =
        !q ||
        m.material_name?.toLowerCase().includes(q) ||
        m.supplier?.toLowerCase().includes(q)
      const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter
      return matchesSearch && matchesCategory
    })
  }, [materials, search, categoryFilter])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-6 mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Raw Materials
        </h1>
        <button
          onClick={openCreateForm}
          className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg shadow transition"
        >
          + Add Material
        </button>
      </div>

      {errorMsg && (
        <div className="bg-white border border-red-300 text-red-600 rounded-lg shadow p-4 mb-4">
          {errorMsg}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search material or supplier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading raw materials...</p>
        ) : filteredMaterials.length === 0 ? (
          <p className="text-gray-400 text-sm italic">
            {materials.length === 0
              ? 'No raw materials added yet.'
              : 'No materials match your search or filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                  <th className="py-2 pr-4">Material</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Unit Cost</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((m) => {
                  const status = m.status || 'In Stock'
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-red-50/40">
                      <td className="py-2 pr-4 font-medium text-gray-700">{m.material_name}</td>
                      <td className="py-2 pr-4 text-gray-500">{m.category || '—'}</td>
                      <td className="py-2 pr-4">
                        {m.current_stock} {m.unit}
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{m.supplier || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">
                        {m.unit_cost != null ? `₱${m.unit_cost}` : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={status}
                          onChange={(e) => handleStatusChange(m, e.target.value)}
                          className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400 ${STATUS_STYLES[status]}`}
                        >
                          {STOCK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => openEditForm(m)}
                            className="text-red-600 hover:underline text-xs font-semibold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="text-gray-400 hover:text-red-600 hover:underline text-xs font-semibold"
                          >
                            Delete
                          </button>
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

      {/* Add / Edit Material Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editingId ? 'Edit Raw Material' : 'Add Raw Material'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Material Name
                </label>
                <input
                  type="text"
                  name="material_name"
                  value={formData.material_name}
                  onChange={handleFormChange}
                  placeholder="e.g. Oil - Bergamoth Note"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleFormChange}
                    placeholder="e.g. Essential Oil"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Unit
                  </label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Current Stock
                </label>
                <input
                  type="number"
                  name="current_stock"
                  min="0"
                  step="any"
                  value={formData.current_stock}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    name="supplier"
                    value={formData.supplier}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Unit Cost (₱)
                  </label>
                  <input
                    type="number"
                    name="unit_cost"
                    min="0"
                    step="any"
                    value={formData.unit_cost}
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
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Delete Material</h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-semibold">{deleteTarget.material_name}</span>? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Production_rm
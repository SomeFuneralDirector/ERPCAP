import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { parseCSV } from '../lib/csv-parser'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

const PLATFORM_STYLES = {
  shopee: { dot: 'bg-red-500',    label: 'Shopee' },
  lazada: { dot: 'bg-indigo-700', label: 'Lazada' },
  tiktok: { dot: 'bg-gray-900',   label: 'TikTok Shop' },
}

async function hashFile(text) {
  const data = new TextEncoder().encode(text)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

function extractDateRange(orders) {
  const dates = orders
    .map(o => o.created_at || o.paid_time || o.completed_at)
    .filter(Boolean)
    .map(d => {
      const cleaned = d.replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')
      const parsed  = new Date(cleaned)
      return isNaN(parsed) ? null : parsed
    })
    .filter(Boolean)
    .sort((a, b) => a - b)

  if (!dates.length) return { dateFrom: null, dateTo: null }
  return {
    dateFrom: dates[0].toISOString().split('T')[0],
    dateTo:   dates[dates.length - 1].toISOString().split('T')[0],
  }
}

// Required headers per platform (verified against real exports)
const REQUIRED_HEADERS = {
  shopee: ['Order ID', 'Order Status', 'Username (Buyer)', 'Grand Total'],
  lazada: ['orderItemId', 'orderNumber', 'status', 'paidPrice'],
  tiktok: ['Order ID', 'Order Status', 'SKU ID', 'Order Amount'],
}

function validateHeaders(headers, platform) {
  return (REQUIRED_HEADERS[platform] || []).filter(h => !headers.includes(h))
}

export default function CSVImport({ onImportComplete }) {
  const [step,         setStep]         = useState('upload')
  const [dragOver,     setDragOver]     = useState(false)
  const [parsed,       setParsed]       = useState(null)
  const [fileHash,     setFileHash]     = useState(null)
  const [dateRange,    setDateRange]    = useState(null)
  const [error,        setError]        = useState(null)
  const [warning,      setWarning]      = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [progress,     setProgress]     = useState({ current: 0, total: 0 })

  const handleFile = useCallback(async (file) => {
    setError(null)
    setWarning(null)
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Invalid file type. Please upload a .csv or .xlsx file exported from Shopee, Lazada, or TikTok Shop.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large (max 20 MB).')
      return
    }

    try {
      let text
      if (ext === 'csv') {
        text = await file.text()
      } else {
        const XLSX   = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs')
        const buffer = await file.arrayBuffer()
        const wb     = XLSX.read(buffer)
        const ws     = wb.Sheets[wb.SheetNames[0]]
        text         = XLSX.utils.sheet_to_csv(ws)
      }

      // parseCSV already filters to COMPLETED only (inside csv-parser.js)
      const result = parseCSV(text)
      if (result.error) { setError(result.error); return }

      // Validate headers
      const firstLine    = text.split('\n')[0]
      const rawHeaders   = firstLine.split(',').map(h => h.replace(/"/g, '').trim())
      const missingHdrs  = validateHeaders(rawHeaders, result.platform)
      if (missingHdrs.length) {
        setError(
          `Missing required columns: ${missingHdrs.join(', ')}. ` +
          `Please export directly from ${PLATFORM_STYLES[result.platform]?.label} Seller Center.`
        )
        return
      }

      // All rows were non-completed
      if (result.orders.length === 0) {
        const skipped = result.allOrderCount || result.rowCount
        setError(
          `No COMPLETED orders found in this file. ` +
          `Found ${skipped} order(s) with other statuses — ` +
          `only COMPLETED orders are imported.`
        )
        return
      }

      const hash  = await hashFile(text)
      setFileHash(hash)
      const range = extractDateRange(result.orders)
      setDateRange(range)

      // Duplicate check
      const { data: dupCheck, error: dupErr } = await supabase.rpc('check_duplicate_import', {
        p_platform:  result.platform,
        p_file_hash: hash,
        p_date_from: range.dateFrom,
        p_date_to:   range.dateTo,
      })
      if (!dupErr && dupCheck?.isDuplicate) {
        setError(
          dupCheck.reason === 'same_file'
            ? `🚫 Duplicate file detected. ${dupCheck.message}`
            : `🚫 Date conflict. ${dupCheck.message}`
        )
        await supabase.from('import_logs').insert({
          platform: result.platform, filename: file.name, file_hash: hash,
          date_from: range.dateFrom, date_to: range.dateTo,
          row_count: result.rowCount, parsed_count: result.parsedCount,
          inserted: 0, skipped: 0, status: 'rejected', reject_reason: dupCheck.message,
        })
        return
      }

      if (!range.dateFrom) {
        setWarning('Could not detect order dates. Duplicate date checking is disabled for this import.')
      }

      // Warn about excluded non-completed orders
      if (result.skippedCount > 0) {
        setWarning(
          `${result.skippedCount} non-completed order(s) were excluded (To Ship, Shipped, Cancelled, etc.). ` +
          `Only the ${result.parsedCount} COMPLETED order(s) below will be imported.`
        )
      }

      setParsed({ ...result, filename: file.name })
      setStep('preview')

    } catch (e) {
      setError('Failed to read file: ' + e.message)
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const importToSupabase = async () => {
    setStep('importing')
    setProgress({ current: 0, total: parsed.orders.length })

    let inserted = 0, skipped = 0
    const errors = []

    for (let i = 0; i < parsed.orders.length; i++) {
      const order = parsed.orders[i]
      setProgress({ current: i + 1, total: parsed.orders.length })

      // Safety guard — only COMPLETED
      if (order.status !== 'COMPLETED') { skipped++; continue }

      try {
        const { data: orderRow, error: orderErr } = await supabase
          .from('orders')
          .upsert({
            platform:        order.platform,
            order_id:        order.order_id,
            status:          order.status,
            tracking_no:     order.tracking_no,
            shipping_option: order.shipping_option,
            payment_method:  order.payment_method,
            total_amount:    order.total_amount,
            shipping_fee:    order.shipping_fee,
            buyer_username:  order.buyer_username,
            recipient_name:  order.recipient_name,
            phone:           order.phone,
            address:         order.address,
            created_at:      order.created_at,
            paid_time:       order.paid_time,
            completed_at:    order.completed_at,
            cancel_reason:   order.cancel_reason,
            buyer_note:      order.buyer_note,
          }, { onConflict: 'platform,order_id' })
          .select()
          .single()

        if (orderErr) { skipped++; errors.push(`${order.order_id}: ${orderErr.message}`); continue }

        if (order.items?.length > 0) {
          await supabase.from('order_items')
            .delete()
            .eq('order_id', order.order_id)
            .eq('platform', order.platform)

          await supabase.from('order_items').insert(
            order.items.map(item => ({
              order_uuid:     orderRow.id,
              platform:       order.platform,
              order_id:       order.order_id,
              product_name:   item.product_name,
              sku:            item.sku,
              variation:      item.variation,
              quantity:       item.quantity,
              unit_price:     item.unit_price,
              original_price: item.original_price || item.unit_price,
              platform_disc:  item.platform_disc  || 0,
              seller_disc:    item.seller_disc     || 0,
            }))
          )
        }
        inserted++
      } catch (e) {
        errors.push(`${order.order_id}: ${e.message}`)
        skipped++
      }
    }

    await supabase.from('import_logs').insert({
      platform:      parsed.platform,
      filename:      parsed.filename,
      file_hash:     fileHash,
      date_from:     dateRange?.dateFrom || null,
      date_to:       dateRange?.dateTo   || null,
      row_count:     parsed.rowCount,
      parsed_count:  parsed.parsedCount,
      inserted, skipped,
      errors:        errors.length ? errors : null,
      status:        'success',
    })

    setImportResult({ inserted, skipped, errors, dateRange })
    setStep('done')
    if (onImportComplete) onImportComplete()
  }

  const reset = () => {
    setStep('upload'); setParsed(null); setFileHash(null)
    setDateRange(null); setImportResult(null); setError(null); setWarning(null)
  }

  return (
    <div className="max-w-4xl mx-auto">

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Import Orders</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload your Shopee, Lazada, or TikTok Shop export.{' '}
          <span className="text-green-600 font-medium">Only COMPLETED orders are imported.</span>
        </p>
      </div>

      {/* ── UPLOAD ── */}
      {step === 'upload' && (
        <div>
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById('csv-input').click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
              ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
          >
            <div className="text-5xl mb-3">📂</div>
            <p className="font-semibold text-gray-700 text-base">Drop CSV or Excel file here</p>
            <p className="text-gray-400 text-sm mt-2">
              Shopee (.csv / .xlsx) · Lazada (.csv / .xlsx) · TikTok Shop (.csv / .xlsx)
            </p>
            <input id="csv-input" type="file" accept=".csv,.xlsx,.xls"
              className="hidden" onChange={e => handleFile(e.target.files[0])} />
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm leading-relaxed">
              {error}
            </div>
          )}

          <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <p className="font-semibold text-sm text-gray-700 mb-2">Import rules</p>
            {[
              { text: 'Only COMPLETED orders are imported — all other statuses are excluded automatically', highlight: true },
              { text: 'Accepted: .csv or .xlsx from Shopee, Lazada, or TikTok Shop Seller Center' },
              { text: 'Same file cannot be imported twice (blocked by file fingerprint)' },
              { text: 'Already-imported date ranges are blocked' },
              { text: 'The file itself is NOT stored — only order data is saved' },
            ].map((rule, i) => (
              <p key={i} className={`text-sm flex gap-2 ${rule.highlight ? 'text-green-700 font-medium' : 'text-slate-600'}`}>
                <span className="text-green-500 font-bold shrink-0">✓</span>
                {rule.text}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {step === 'preview' && parsed && (
        <div>
          <div className="mb-4 p-3 bg-green-50 border border-green-300 rounded-lg flex items-center gap-2">
            <span className="text-green-500 text-lg">✅</span>
            <p className="text-green-800 text-sm font-medium">
              Showing COMPLETED orders only — all other statuses have been excluded.
            </p>
          </div>

          {warning && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-800 text-sm">
              ⚠️ {warning}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Platform">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${PLATFORM_STYLES[parsed.platform]?.dot}`} />
                <span className="font-bold text-gray-800">{PLATFORM_STYLES[parsed.platform]?.label}</span>
              </div>
            </StatCard>
            <StatCard label="Completed Orders">
              <span className="text-2xl font-bold text-green-600">{parsed.summary.total_orders}</span>
            </StatCard>
            <StatCard label="Total Amount">
              <span className="text-lg font-bold text-gray-800">{parsed.summary.total_amount}</span>
            </StatCard>
            <StatCard label="Date Range">
              <span className="text-sm font-semibold text-gray-800">
                {dateRange?.dateFrom ? `${dateRange.dateFrom} → ${dateRange.dateTo}` : 'Unknown'}
              </span>
            </StatCard>
          </div>

          {/* Orders table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 mb-5">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Order ID', 'Recipient', 'Items', 'Total (PHP)', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.orders.map((o, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.order_id}</td>
                    <td className="px-4 py-3 text-gray-700">{o.recipient_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{o.items.length}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{(o.total_amount / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {(o.completed_at || o.created_at || o.paid_time || '—').split(' ')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={reset}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
              ← Cancel
            </button>
            <button onClick={importToSupabase}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
              Import {parsed.summary.total_orders} completed orders →
            </button>
          </div>
        </div>
      )}

      {/* ── IMPORTING ── */}
      {step === 'importing' && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">⏳</div>
          <p className="text-lg font-semibold text-gray-800 mb-2">Importing completed orders…</p>
          <p className="text-gray-500 text-sm mb-6">{progress.current} of {progress.total} saved</p>
          <div className="bg-gray-200 rounded-full h-2 max-w-sm mx-auto">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && importResult && (
        <div>
          <div className="text-center p-8 bg-green-50 border border-green-200 rounded-xl mb-5">
            <div className="text-5xl mb-3">✅</div>
            <h3 className="text-lg font-bold text-green-700">Import Complete</h3>
            {importResult.dateRange?.dateFrom && (
              <p className="text-green-600 text-sm mt-1">
                {importResult.dateRange.dateFrom} → {importResult.dateRange.dateTo}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatCard label="Imported">
              <span className="text-2xl font-bold text-green-600">{importResult.inserted}</span>
            </StatCard>
            <StatCard label="Skipped (duplicates / errors)">
              <span className="text-2xl font-bold text-amber-500">{importResult.skipped}</span>
            </StatCard>
          </div>

          {importResult.errors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="font-semibold text-red-600 text-sm mb-2">Errors ({importResult.errors.length})</p>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-500 mt-1">• {e}</p>
              ))}
            </div>
          )}

          <button onClick={reset}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, children }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  )
}
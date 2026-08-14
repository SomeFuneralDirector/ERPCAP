import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt,
  X,
  Truck,
  Megaphone,
  Package,
  Zap,
  Users,
  Droplet,
  Tag,
} from "lucide-react";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "card", label: "Card" },
];

// Map known category names to an icon. Falls back to a generic tag icon
// for any category not listed here (so custom categories still render fine).
const CATEGORY_ICONS = {
  Shipping: Truck,
  Advertising: Megaphone,
  Packaging: Package,
  Utilities: Zap,
  Salaries: Users,
  "Raw Materials": Droplet,
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  category_id: "",
  amount: "",
  payment_method: "cash",
  notes: "",
  receipt_file: null,
};

function ExpenseForm({ onSaved }) {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null); // { type: "success" | "error", message }
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [lastAmount, setLastAmount] = useState(null); // last submitted amount for the selected category

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id, name")
      .order("name");
    if (error) {
      console.error("Error loading categories:", error);
      return;
    }
    setCategories(data || []);
  }

  async function loadLastAmountForCategory(categoryId) {
    setLastAmount(null);
    if (!categoryId) return;

    const { data, error } = await supabase
      .from("expenses")
      .select("amount, date")
      .eq("category_id", categoryId)
      .order("date", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error loading last amount:", error);
      return;
    }
    if (data && data.length > 0) {
      setLastAmount(data[0].amount);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
  }

  function selectCategory(categoryId) {
    handleChange("category_id", categoryId);
    loadLastAmountForCategory(categoryId);
  }

  function useLastAmount() {
    if (lastAmount == null) return;
    handleChange("amount", (lastAmount / 100).toString());
  }

  function handleReceiptChange(file) {
    handleChange("receipt_file", file);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    if (file && file.type.startsWith("image/")) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview(null);
    }
  }

  function clearReceipt() {
    handleChange("receipt_file", null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
  }

  function validate() {
    const errors = {};
    if (!form.date) errors.date = "Date is required";
    if (!form.category_id) errors.category_id = "Select a category";

    const amountNum = parseFloat(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) {
      errors.amount = "Enter an amount greater than 0";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBanner(null);

    if (!validate()) {
      setBanner({
        type: "error",
        message: "Please fix the highlighted fields before submitting.",
      });
      return;
    }

    setSaving(true);

    let receiptUrl = null;
    if (form.receipt_file) {
      const fileName = `receipts/${Date.now()}_${form.receipt_file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("expense-receipts")
        .upload(fileName, form.receipt_file);

      if (uploadErr) {
        console.error("Error uploading receipt:", uploadErr);
        setBanner({
          type: "error",
          message: "Receipt upload failed. The expense was not saved.",
        });
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("expense-receipts")
        .getPublicUrl(fileName);
      receiptUrl = urlData?.publicUrl || null;
    }

    const { error } = await supabase.from("expenses").insert({
      date: form.date,
      category_id: form.category_id,
      amount: Math.round(parseFloat(form.amount) * 100),
      payment_method: form.payment_method,
      notes: form.notes?.trim() || null,
      receipt_url: receiptUrl,
      status: "pending",
      created_by: user?.id,
    });

    setSaving(false);

    if (error) {
      console.error("Error saving expense:", error);
      setBanner({
        type: "error",
        message: "Something went wrong saving the expense. Try again.",
      });
      return;
    }

    setBanner({ type: "success", message: "Expense submitted for approval." });
    setForm(EMPTY_FORM);
    clearReceipt();
    setLastAmount(null);

    if (onSaved) onSaved();
  }

  const amountPreview =
    form.amount && !isNaN(parseFloat(form.amount))
      ? parseFloat(form.amount).toLocaleString("en-PH", {
          style: "currency",
          currency: "PHP",
        })
      : null;

  const lastAmountDisplay =
    lastAmount != null
      ? (lastAmount / 100).toLocaleString("en-PH", {
          style: "currency",
          currency: "PHP",
        })
      : null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4 bg-white rounded-lg shadow p-6">
        Expense Form
      </h1>
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>

          {banner && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                banner.type === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {banner.type === "success" ? (
                <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              )}
              <span>{banner.message}</span>
            </div>
          )}

          {/* Category quick-pick */}
          <div>
            <label className="text-xs font-semibold text-gray-500">
              Category <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {categories.map((c) => {
                const Icon = CATEGORY_ICONS[c.name] || Tag;
                const isSelected = form.category_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCategory(c.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                      isSelected
                        ? "border-red-600 bg-red-50 text-red-700 font-semibold"
                        : "border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50/50"
                    }`}
                  >
                    <Icon size={16} className="flex-shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.category_id && (
              <p className="text-xs text-red-500 mt-1">
                {fieldErrors.category_id}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChange("date", e.target.value)}
                className={`w-full border rounded px-2 py-1.5 text-sm mt-1 ${
                  fieldErrors.date ? "border-red-400" : "border-gray-300"
                }`}
              />
              {fieldErrors.date && (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.date}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">
                Total Amount (₱) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                placeholder="0.00"
                className={`w-full border rounded px-2 py-1.5 text-sm mt-1 ${
                  fieldErrors.amount ? "border-red-400" : "border-gray-300"
                }`}
              />
              {fieldErrors.amount ? (
                <p className="text-xs text-red-500 mt-1">{fieldErrors.amount}</p>
              ) : (
                amountPreview && (
                  <p className="text-xs text-gray-400 mt-1">{amountPreview}</p>
                )
              )}
              {lastAmountDisplay && (
                <button
                  type="button"
                  onClick={useLastAmount}
                  className="text-xs text-red-600 hover:underline mt-1"
                >
                  Use last amount for this category: {lastAmountDisplay}
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">
                Payment Method
              </label>
              <select
                value={form.payment_method}
                onChange={(e) => handleChange("payment_method", e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-1"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">
                Receipt
              </label>
              {!form.receipt_file ? (
                <label className="mt-1 flex items-center gap-2 border border-dashed border-gray-300 rounded px-3 py-2 text-sm text-gray-500 cursor-pointer hover:border-red-400 hover:text-red-500 transition-colors">
                  <Receipt size={16} />
                  <span>Attach photo or PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) =>
                      handleReceiptChange(e.target.files?.[0] || null)
                    }
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded px-3 py-2 text-sm">
                  {receiptPreview ? (
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="w-8 h-8 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <Receipt size={16} className="flex-shrink-0 text-gray-400" />
                  )}
                  <span className="truncate flex-1 text-gray-600">
                    {form.receipt_file.name}
                  </span>
                  <button
                    type="button"
                    onClick={clearReceipt}
                    className="text-gray-400 hover:text-red-500 flex-shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-1"
              rows={2}
              placeholder="Optional details, e.g. covers Aug 1–15 payroll"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-bold px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving…" : "Submit Expense"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ExpenseForm;
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { Category, Company, Department } from "../../types";

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { error?: string } } };
  return axiosErr.response?.data?.error ?? fallback;
}

export default function MasterData() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptCompanyId, setDeptCompanyId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");

  const [editingCompany, setEditingCompany] = useState<{ id: string; name: string } | null>(null);
  const [editingDept, setEditingDept] = useState<{ id: string; name: string; companyId: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; parentId: string } | null>(null);

  function refresh() {
    api.get<Company[]>("/companies").then((res) => setCompanies(res.data));
    api.get<Department[]>("/departments").then((res) => setDepartments(res.data));
    api.get<Category[]>("/categories").then((res) => setCategories(res.data));
  }
  useEffect(refresh, []);

  async function addCompany(e: FormEvent) {
    e.preventDefault();
    await api.post("/companies", { name: companyName });
    setCompanyName("");
    refresh();
  }
  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!editingCompany) return;
    setError(null);
    try {
      await api.patch(`/companies/${editingCompany.id}`, { name: editingCompany.name });
      setEditingCompany(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update company."));
    }
  }
  async function deleteCompany(id: string) {
    if (!confirm("Delete this company? This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/companies/${id}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete company."));
    }
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    await api.post("/departments", { name: deptName, companyId: deptCompanyId });
    setDeptName("");
    refresh();
  }
  async function saveDepartment(e: FormEvent) {
    e.preventDefault();
    if (!editingDept) return;
    setError(null);
    try {
      await api.patch(`/departments/${editingDept.id}`, { name: editingDept.name, companyId: editingDept.companyId });
      setEditingDept(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update department."));
    }
  }
  async function deleteDepartment(id: string) {
    if (!confirm("Delete this department? This cannot be undone.")) return;
    setError(null);
    try {
      await api.delete(`/departments/${id}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete department."));
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    await api.post("/categories", { name: categoryName, parentId: categoryParentId || undefined });
    setCategoryName("");
    refresh();
  }
  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    setError(null);
    try {
      await api.patch(`/categories/${editingCategory.id}`, {
        name: editingCategory.name,
        parentId: editingCategory.parentId || null,
      });
      setEditingCategory(null);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not update category."));
    }
  }
  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Its sub-categories will be deleted too.")) return;
    setError(null);
    try {
      await api.delete(`/categories/${id}`);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete category."));
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}
      <div className="grid sm:grid-cols-3 gap-4">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="font-medium text-slate-900 mb-3">Companies</h3>
          <form onSubmit={addCompany} className="flex gap-2 mb-3">
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="New company" required className="input" />
            <button type="submit" className="bg-slate-900 text-white rounded-lg px-3 text-sm">Add</button>
          </form>
          <ul className="text-sm text-slate-700 space-y-1">
            {companies.map((c) =>
              editingCompany?.id === c.id ? (
                <li key={c.id}>
                  <form onSubmit={saveCompany} className="flex gap-1">
                    <input
                      value={editingCompany.name}
                      onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                      className="input py-1"
                      autoFocus
                    />
                    <button type="submit" className="text-xs text-slate-900 font-medium px-2">Save</button>
                    <button type="button" onClick={() => setEditingCompany(null)} className="text-xs text-slate-400 px-1">✕</button>
                  </form>
                </li>
              ) : (
                <li key={c.id} className="flex items-center justify-between group">
                  <span>{c.name}</span>
                  <span className="hidden group-hover:flex gap-2 text-xs">
                    <button onClick={() => setEditingCompany({ id: c.id, name: c.name })} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <button onClick={() => deleteCompany(c.id)} className="text-red-500 hover:text-red-700">Delete</button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="font-medium text-slate-900 mb-3">Departments</h3>
          <form onSubmit={addDepartment} className="space-y-2 mb-3">
            <input value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="New department" required className="input" />
            <select value={deptCompanyId} onChange={(e) => setDeptCompanyId(e.target.value)} required className="input">
              <option value="">Company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="w-full bg-slate-900 text-white rounded-lg py-1.5 text-sm">Add</button>
          </form>
          <ul className="text-sm text-slate-700 space-y-1">
            {departments.map((d) =>
              editingDept?.id === d.id ? (
                <li key={d.id}>
                  <form onSubmit={saveDepartment} className="space-y-1">
                    <input
                      value={editingDept.name}
                      onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                      className="input py-1"
                      autoFocus
                    />
                    <select
                      value={editingDept.companyId}
                      onChange={(e) => setEditingDept({ ...editingDept, companyId: e.target.value })}
                      className="input py-1"
                    >
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" className="text-xs text-slate-900 font-medium">Save</button>
                      <button type="button" onClick={() => setEditingDept(null)} className="text-xs text-slate-400">Cancel</button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={d.id} className="flex items-center justify-between group">
                  <span>{d.name}</span>
                  <span className="hidden group-hover:flex gap-2 text-xs">
                    <button onClick={() => setEditingDept({ id: d.id, name: d.name, companyId: d.companyId })} className="text-slate-500 hover:text-slate-900">Edit</button>
                    <button onClick={() => deleteDepartment(d.id)} className="text-red-500 hover:text-red-700">Delete</button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="font-medium text-slate-900 mb-3">Categories</h3>
          <form onSubmit={addCategory} className="space-y-2 mb-3">
            <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" required className="input" />
            <select value={categoryParentId} onChange={(e) => setCategoryParentId(e.target.value)} className="input">
              <option value="">Top-level (no parent)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="w-full bg-slate-900 text-white rounded-lg py-1.5 text-sm">Add</button>
          </form>
          <ul className="text-sm text-slate-700 space-y-1">
            {categories.map((c) => (
              <li key={c.id}>
                {editingCategory?.id === c.id ? (
                  <form onSubmit={saveCategory} className="space-y-1">
                    <input
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      className="input py-1"
                      autoFocus
                    />
                    <select
                      value={editingCategory.parentId}
                      onChange={(e) => setEditingCategory({ ...editingCategory, parentId: e.target.value })}
                      className="input py-1"
                    >
                      <option value="">Top-level (no parent)</option>
                      {categories.filter((opt) => opt.id !== c.id).map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" className="text-xs text-slate-900 font-medium">Save</button>
                      <button type="button" onClick={() => setEditingCategory(null)} className="text-xs text-slate-400">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between group">
                    <span>{c.name}</span>
                    <span className="hidden group-hover:flex gap-2 text-xs">
                      <button onClick={() => setEditingCategory({ id: c.id, name: c.name, parentId: c.parentId ?? "" })} className="text-slate-500 hover:text-slate-900">Edit</button>
                      <button onClick={() => deleteCategory(c.id)} className="text-red-500 hover:text-red-700">Delete</button>
                    </span>
                  </div>
                )}
                {c.subCategories && c.subCategories.length > 0 && (
                  <ul className="ml-4 text-xs text-slate-500 space-y-1 mt-1">
                    {c.subCategories.map((sc) => (
                      <li key={sc.id} className="flex items-center justify-between group">
                        <span>— {sc.name}</span>
                        <span className="hidden group-hover:flex gap-2">
                          <button onClick={() => setEditingCategory({ id: sc.id, name: sc.name, parentId: c.id })} className="text-slate-500 hover:text-slate-900">Edit</button>
                          <button onClick={() => deleteCategory(sc.id)} className="text-red-500 hover:text-red-700">Delete</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

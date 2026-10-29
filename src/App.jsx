import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Login from "./Pages/Login.jsx";
import "./App.css";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Admin from "./Pages/Admin.jsx";
import Activity_logs from "./Pages/Activity_logs.jsx";
import Finance from "./Pages/Finance.jsx";
import ExpenseForm from "./Pages/ExpenseForm.jsx";
import Ledger from "./Pages/Ledger.jsx";
import User_Management from "./Pages/User_Management.jsx";
import SetPassword from "./Pages/SetPassword.jsx";
import Balance_sheet from "./Pages/Balance_sheet.jsx";
import Income_statement from "./Pages/Income_statement.jsx";
import Marketing from "./Pages/Marketing.jsx";
import Marketing_io from "./Pages/Marketing_io.jsx";
import Marketing_camp from "./Pages/Marketing_camp.jsx";
import Marketing_reco from "./Pages/Marketing_reco.jsx";
import Sales from "./Pages/Sales.jsx";
import Sales_db from "./Pages/Sales_db.jsx";
import Inventory from "./Pages/Inventory.jsx";
import Inventory_db from "./Pages/Inventory_db.jsx";
import Inventory_pm from "./Pages/Inventory_pm.jsx";
import InventoryArchive from "./Pages/InventoryArchive.jsx";
import Production from "./Pages/Production.jsx";
import Production_wo from "./Pages/Production_wo.jsx";
import Production_rm from "./Pages/Production_rm.jsx";
import Production_fg from "./Pages/Production_fg.jsx";
import RawMaterialOverview from "./Pages/RawMaterialOverview.jsx";
import PackagingMaterialOverview from "./Pages/PackagingMaterialOverview.jsx"
import Production_bom from "./Pages/Production_bom.jsx";
import Production_transaction from "./Pages/Production_transaction.jsx";
import ProtectedRoute from "./Routes/ProtectedRoutes.jsx";
import Settings from "./Pages/Settings.jsx";
import Nav from "./Components/Navigation.jsx";

const SITE = "Isonfam";

const PAGE_TITLES = {
  "/set-password": "Set Password",
  "/admin": "Admin Dashboard",
  "/finance": "Finance",
  "/ledger": "Cash Book",
  "/balance_sheet": "Balance Sheet",
  "/income_statement": "Income Statement",
  "/user_management": "User Management",
  "/activity_logs": "Activity Logs",
  "/expense_form": "Expense Form",
  "/inventory_db": "Inventory Dashboard",
  "/inventory": "Products",
  "/production_rm": "Raw Materials",
  "/inventory_pm": "Packaging Material",
  "/inventory_archive": "Archive",
  "/marketing": "Marketing Dashboard",
  "/marketing_camp": "Campaigns",
  "/marketing_io": "Inventory Overview",
  "/marketing_reco": "Recommendation",
  "/sales_db": "Sales Dashboard",
  "/sales": "Sales Transactions",
  "/production": "Production Dashboard",
  "/production_transaction": "Production Transactions",
  "/production_wo": "Work Orders",
  "/production_fg": "Finished Goods",
  "/RawMaterialOverview": "Raw Materials Overview",
  "/PackagingMaterialOverview": "Packaging Material Overview",
  "/production_bom": "Bill of Materials",
  "/setttings": "Settings",
};

function TitleManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = PAGE_TITLES[pathname];
    document.title = page ? `${page} | ${SITE}` : SITE;
  }, [pathname]);

  return null;
}

const DashboardLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen">
      <Nav />
      <main className="flex-1 overflow-y-auto bg-gray-100">
        <Routes>
          <Route path="/admin" element={<Admin />} />
          <Route path="/activity_logs" element={<Activity_logs />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/expense_form" element={<ExpenseForm />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/user_management" element={<User_Management />} />
          <Route path="/balance_sheet" element={<Balance_sheet />} />
          <Route path="/income_statement" element={<Income_statement />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/marketing_io" element={<Marketing_io />} />
          <Route path="/marketing_camp" element={<Marketing_camp />} />
          <Route path="/marketing_reco" element={<Marketing_reco />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales_db" element={<Sales_db />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory_db" element={<Inventory_db />} />
          <Route path="/inventory_pm" element={<Inventory_pm />} />
          <Route path="/Inventory_archive" element={<InventoryArchive />} />
          <Route path="/production" element={<Production />} />
          <Route path="/production_transaction" element={<Production_transaction />} />
          <Route path="/production_wo" element={<Production_wo />} />
          <Route path="/production_rm" element={<Production_rm />} />
          <Route path="/production_fg" element={<Production_fg />} />
          <Route path="/RawMaterialOverview" element={<RawMaterialOverview/>} />
          <Route path="/PackagingMaterialOverview" element={<PackagingMaterialOverview />} />
          <Route path="/production_bom" element={<Production_bom />} />
          <Route path="/setttings" element={<Settings />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <TitleManager />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Login />} />

          {/* Invite-link landing page. Public in the sense that it
              doesn't go through ProtectedRoute's app-level checks or
              render the dashboard shell, the user's only "auth" at this
              point is the magic-link session Supabase created when they
              clicked the invite, they haven't set a password yet. */}
          <Route path="/set-password" element={<SetPassword />} />

          {/* Protected routes with layout */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
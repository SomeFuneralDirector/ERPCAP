import Login from "./Pages/Login.jsx";
import "./App.css";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Admin from "./Pages/Admin.jsx";
import Marketing from "./Pages/Marketing.jsx";
import Marketing_io from "./Pages/Marketing_io.jsx";
import Sales from './Pages/Sales.jsx';
import Sales_db from './Pages/Sales_db.jsx';
import Inventory from './Pages/Inventory.jsx';
import Inventory_db from './Pages/Inventory_db.jsx';
import Production from './Pages/Production.jsx';
import Production_wo from './Pages/Production_wo.jsx';
import Production_rm from './Pages/Production_rm.jsx';
import Production_fg from './Pages/Production_fg.jsx';
import ProtectedRoute from "./Routes/ProtectedRoutes.jsx";
import Nav from "./Components/Navigation.jsx";

// Layout component that includes the navigation and main content area
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
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/marketing_io" element={<Marketing_io />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales_db" element={<Sales_db />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/inventory_db" element={<Inventory_db />} />
          <Route path="/production" element={<Production />} />
          <Route path="/production_wo" element={<Production_wo />} />
          <Route path="/production_rm" element={<Production_rm />} />
          <Route path="/production_fg" element={<Production_fg />} />
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
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Login />} />
          
          {/* Protected routes with layout */}
          <Route path="/*" element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
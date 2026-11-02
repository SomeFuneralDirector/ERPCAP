import { useAuth } from "../context/AuthContext";

const ACCENT = "#B3211B";

function Greetings() {
  const { fullName, user } = useAuth();

  const name = fullName || user?.email?.split("@")[0] || "there";

  return (
    <div className="flex justify-end">
      <p className="text-lg text-gray-500">
        Welcome,{" "}
        <span className="font-semibold" style={{ color: ACCENT }}>
          {name}
        </span>
      </p>
    </div>
  );
}

export default Greetings;
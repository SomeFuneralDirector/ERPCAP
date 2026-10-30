import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ACCENT = "#B3211B";
const ACCENT_SOFT = "#FDF2F1";
const ACCENT_BORDER = "#F0D0CD";

const GREETINGS = [
  "Welcome back",
  "Good to see you",
  "Hello",
  "Hi there",
  "Nice to see you",
  "Glad you're here",
  "Welcome",
  "Musta ka na",
  "Hey there",
  "Hello again",
  "Good day",
  "Nice to have you back",
  "Hi",
  "Hope you're doing well",
  "Pleased to see you",
];

const SUBLINES = [
  "Hope you're having a good day.",
  "Oras na naman para mag banat ng buto.",
  "Glad you're here.",
  "Take your time.",
  "Trabaho na naman? kapagod yan",
  "Hope everything is going well.",
  "Wishing you a calm and productive day.",
  "Happy to have you back.",
  "Hope everything's going well.",
  "Wishing you a smooth day ahead.",
  "Let's make today productive.",
];

function Greetings() {
  const { fullName, user, role } = useAuth();
  const [visible, setVisible] = useState(true);

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    []
  );
  const subline = useMemo(
    () => SUBLINES[Math.floor(Math.random() * SUBLINES.length)],
    []
  );

  if (!visible) return null;

  const name = fullName || user?.email?.split("@")[0] || "there";
  const roleDisplay = role
    ? role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ")
    : "User";

  return (
    <div
      className="relative overflow-hidden rounded-xl border px-6 py-5 shadow-sm"
      style={{
        backgroundColor: ACCENT_SOFT,
        borderColor: ACCENT_BORDER,
      }}
    >
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss greeting"
        className="absolute top-1/2 -translate-y-1/2 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={{ "--tw-ring-color": ACCENT }}
      >
        <X size={16} strokeWidth={3} />
      </button>

      <div className="text-center px-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl truncate text-gray-900">
          {greeting},{" "}
          <span style={{ color: ACCENT }}>{name}!</span>
        </h2>
        <p className="mt-1 text-sm text-gray-500">{subline}</p>
        <p className="mt-1 text-sm text-gray-500">
          Your role is{" "}
          <span className="font-medium capitalize text-gray-700">
            {roleDisplay}
          </span>
        </p>
      </div>
    </div>
  );
}

export default Greetings;
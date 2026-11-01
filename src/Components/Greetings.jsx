/*
import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ACCENT = "#B3211B";
const ACCENT_SOFT = "#f7f7f7";
const ACCENT_BORDER = "#eceaea";

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
      className="relative overflow-hidden rounded-xl border px-6 py-5 shadow-lg"
      style={{
        backgroundColor: ACCENT_SOFT,
        borderColor: ACCENT_BORDER,
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.20), 0 2px 6px rgba(2, 2, 2, 0.20)",
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
*/

import { useState, useMemo, useEffect } from "react";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ACCENT = "#B3211B";
const ACCENT_SOFT = "#f7f7f7";
const ACCENT_BORDER = "#eceaea";

const GREETINGS = [
  "Tangina na mo",
  "Putangina ka",
  "walang pera  =>",
  "walang tatay =>",
  "badap",
  "bonjing",
  "Bolards > Aquino",
  "Good day",
  "imong mama",
  "tangina mo",
  "Wazzup my nigga",
  "my Nigga",
  "DDS supporter =>", 
  "free our tatay",
  "supporter ni quiboloy",
  "kasama sa island =>"
];

const SUBLINES = [
  "Putanginamo.",
  "tangina ka.",
  "pakyu.",
  "tangina pa rin.",
  "walang ligo",
  "walang magulang.",
  "bonjing.",
  "aquino",
  "AQUINO.",
  "Wishing you a smooth day ahead.",
  "Let's make today productive.",
];

const FLASH_COLORS = [
  "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#ff4500", "#7fff00", "#ff1493", "#00bfff", "#ffd700", "#ff69b4",
  "#32cd32", "#ff6347", "#9400d3", "#00fa9a",
];

function Greetings() {
  const { fullName, user, role } = useAuth();
  const [banners, setBanners] = useState([{ id: 0 }]);
  const [nextId, setNextId] = useState(1);

  // Global flash tick so all banners stay in sync and feel extra chaotic
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 180); // fast flash
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    []
  );
  const subline = useMemo(
    () => SUBLINES[Math.floor(Math.random() * SUBLINES.length)],
    []
  );

  const name = fullName || user?.email?.split("@")[0] || "there";
  const roleDisplay = role
    ? role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ")
    : "User";

  const handleClose = (id) => {
    // Closing just spawns another clone (and keeps the original)
    setBanners((prev) => [...prev, { id: nextId }]);
    setNextId((n) => n + 1);
  };

  // Helper to pick a flashing color based on tick + offset
  const flash = (offset = 0) =>
    FLASH_COLORS[(tick + offset) % FLASH_COLORS.length];

  return (
    <div className="space-y-3">
      {banners.map((banner, index) => {
        const bg = flash(index * 3);
        const border = flash(index * 3 + 1);
        const text1 = flash(index * 5);
        const text2 = flash(index * 5 + 2);
        const text3 = flash(index * 5 + 4);
        const nameColor = flash(index * 7 + 1);

        return (
          <div
            key={banner.id}
            className="relative overflow-hidden rounded-xl border px-6 py-5 shadow-lg transition-colors duration-75"
            style={{
              backgroundColor: bg,
              borderColor: border,
              boxShadow: `0 0 20px ${bg}, 0 0 40px ${border}, 0 4px 14px rgba(0,0,0,0.4)`,
            }}
          >
            <button
              onClick={() => handleClose(banner.id)}
              aria-label="Dismiss greeting (it will just multiply)"
              className="absolute top-1/2 -translate-y-1/2 right-3 flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 focus:outline-none"
              style={{
                backgroundColor: flash(index + 9),
                color: flash(index + 11),
                boxShadow: `0 0 12px ${flash(index + 9)}`,
              }}
            >
              <X size={16} strokeWidth={3} />
            </button>

            <div className="text-center px-10">
              <h2
                className="text-2xl font-semibold tracking-tight sm:text-3xl truncate"
                style={{ color: text1, textShadow: `0 0 8px ${text1}` }}
              >
                {greeting},{" "}
                <span style={{ color: nameColor, textShadow: `0 0 10px ${nameColor}` }}>
                  {name}!
                </span>
              </h2>
              <p
                className="mt-1 text-sm font-medium"
                style={{ color: text2, textShadow: `0 0 6px ${text2}` }}
              >
                {subline}
              </p>
              <p
                className="mt-1 text-sm font-medium"
                style={{ color: text3, textShadow: `0 0 6px ${text3}` }}
              >
                Your role is{" "}
                <span className="font-bold capitalize" style={{ color: flash(index * 4) }}>
                  {roleDisplay}
                </span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Greetings;
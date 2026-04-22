import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "";

export default function SearchBar({ onSelect, onSearch, loading }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/search`, { params: { q: query, limit: 8 } });
        setSuggestions(res.data.results || []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, [query]);

  const handleSubmit = (value) => {
    const v = (value || query).trim();
    if (!v) return;
    setQuery(v);
    setShowDropdown(false);
    onSearch(v);
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") setShowDropdown(false);
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder="Search any value (name, phone, email…)"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1.5px solid rgba(123,111,255,0.4)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#e0d8ff",
            fontSize: 14,
            fontFamily: "'Space Mono', monospace",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.borderColor = "rgba(123,111,255,0.8)")}
          onMouseLeave={(e) => (e.target.style.borderColor = "rgba(123,111,255,0.4)")}
        />
        <button
          onClick={() => handleSubmit()}
          disabled={loading}
          style={{
            background: loading
              ? "rgba(123,111,255,0.3)"
              : "linear-gradient(135deg, #7b6fff, #4a3aaa)",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            color: "#fff",
            fontSize: 13,
            fontFamily: "'Space Mono', monospace",
            fontWeight: "bold",
            cursor: loading ? "wait" : "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "⏳" : "EXPLORE →"}
        </button>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#12121f",
            border: "1px solid rgba(123,111,255,0.4)",
            borderRadius: 8,
            zIndex: 1000,
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              onClick={() => {
                setQuery(s.value);
                setShowDropdown(false);
                onSearch(s.value);
              }}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                borderBottom:
                  i < suggestions.length - 1
                    ? "1px solid rgba(255,255,255,0.05)"
                    : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(123,111,255,0.15)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 13,
                  color: "#e0d8ff",
                }}
              >
                {s.value}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#7b6fff",
                  fontFamily: "monospace",
                }}
              >
                {s.connections} links
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

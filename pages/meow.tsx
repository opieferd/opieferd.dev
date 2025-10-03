import { useEffect, useState } from "react";

export default function MeowPage() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/meow")
      .then(res => res.json())
      .then(data => setCount(data.count));
  }, []);

  const handleMeow = async () => {
    setLoading(true);
    const res = await fetch("/api/meow", { method: "POST" });
    const data = await res.json();
    setCount(data.count);
    setLoading(false);
  };

  return (
    <section style={{ textAlign: "center", marginTop: "4rem" }}>
      <button
        onClick={handleMeow}
        disabled={loading}
        style={{ fontSize: "2rem", padding: "1rem 2rem" }}
      >
        meow
      </button>
      <div style={{ marginTop: "2rem", fontSize: "1.5rem" }}>
        Global meow count: {count}
      </div>
    </section>
  );
}

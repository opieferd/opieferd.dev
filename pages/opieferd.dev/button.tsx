import { useEffect, useState } from "react";
import styles from "../../styles/MeowButton.module.css";

export default function MeowButtonPage() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/meow")
      .then(res => res.json())
      .then(data => setCount(data.count));
  }, []);

  const handleMeowClick = async () => {
    setLoading(true);
    const res = await fetch("/api/meow", { method: "POST" });
    const data = await res.json();
    setCount(data.count);
    setLoading(false);
  };

  return (
    <div className={styles["meow-btn-container"]}>
      <button
        className={styles["meow-btn"]}
        onClick={handleMeowClick}
        disabled={loading}
        aria-label="Meow"
      >
        meow
      </button>
      <span className={styles["meow-count"]}>
        Global meow count: {count}
      </span>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useSol, SolConnectButton } from "./solctx";
import { useLocal, type Note } from "./lib/store";
import { Home } from "./views/Home";
import { Discover } from "./views/Discover";
import { TokenPage } from "./views/Token";
import { Swarm } from "./views/Swarm";
import { Pimd } from "./views/Pimd";
import { Rewards } from "./views/Rewards";
import { Portfolio, Creator } from "./views/Portfolio";

const NAV = [
  { href: "#/", label: "Launch" },
  { href: "#/discover", label: "Discover" },
  { href: "#/swarm", label: "Swarm" },
  { href: "#/pimd", label: "PIMD" },
  { href: "#/rewards", label: "Rewards" },
  { href: "#/portfolio", label: "Portfolio" },
];

const route = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "").split("/");

export function App() {
  const [r, setR] = useState(route);
  useEffect(() => {
    const on = () => { setR(route()); window.scrollTo(0, 0); document.getElementById("main")?.focus({ preventScroll: true }); };
    addEventListener("hashchange", on); return () => removeEventListener("hashchange", on);
  }, []);
  const { cluster, setCluster } = useSol();
  const [notes] = useLocal<Note[]>("notes", []);
  const unread = notes.filter((n) => !n.read).length;
  const [page, arg] = r;
  const active = "#/" + (page || "");

  let view;
  switch (page) {
    case "discover": view = <Discover />; break;
    case "token": view = <TokenPage mint={arg ?? ""} />; break;
    case "swarm": view = <Swarm />; break;
    case "pimd": view = <Pimd />; break;
    case "rewards": view = <Rewards />; break;
    case "portfolio": view = <Portfolio />; break;
    case "creator": view = <Creator address={arg ?? ""} />; break;
    default: view = <Home />;
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <div className="wrap header-row">
          <a className="brand" href="#/" aria-label="IMD Launchpad home">
            <img src="./favicon.svg" width={28} height={28} alt="" />
            <span>IMD Launchpad</span>
          </a>
          <div className="header-actions">
            <label className="visually-hidden" htmlFor="network">Solana network</label>
            <select id="network" className="select-small" value={cluster} onChange={(e) => setCluster(e.target.value as "devnet" | "mainnet")}>
              <option value="devnet">Devnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
            <a className="button button-small button-quiet bell" href="#/portfolio" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
              {unread > 0 && <span className="badge num">{unread}</span>}
            </a>
            <SolConnectButton compact />
          </div>
        </div>
        <nav className="wrap nav" aria-label="Main">
          {NAV.map((n) => <a key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined}>{n.label}</a>)}
        </nav>
      </header>
      {cluster === "mainnet" && <div className="banner" role="note"><div className="wrap">Mainnet: launches and trades use real SOL.</div></div>}
      <main id="main" tabIndex={-1}>{view}</main>
      <footer className="footer">
        <div className="wrap footer-row">
          <p>IMD Launchpad. Idea in. Ecosystem out.</p>
          <p className="muted">Non-custodial. Every transaction is signed in your own wallet.</p>
          <p className="muted">Tokens launch on Raydium LaunchLab. Swarm runs on <a href="https://imd.fun" target="_blank" rel="noreferrer">IMD</a>.</p>
        </div>
      </footer>
    </>
  );
}

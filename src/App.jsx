import { useEffect, useMemo, useState } from "react";
import { identityClaims } from "./anon.js";

const RESTAURANTS = [
  { id: "nasi-lane", name: "Nasi Lane" },
  { id: "teh-house", name: "Teh House" },
];

const MENU = [
  { name: "Nasi Lemak", price: 14.9, note: "Coconut rice, sambal, egg" },
  { name: "Iced Teh Tarik", price: 4.5, note: "Pulled tea over ice" },
  { name: "Roti Canai", price: 5, note: "Crisp flatbread" },
];

function money(value) {
  return `RM ${value.toFixed(2)}`;
}

export default function App() {
  const [accessToken, setAccessToken] = useState("");
  const [signStep, setSignStep] = useState("");
  const [phone, setPhone] = useState("+60123456789");
  const [otp, setOtp] = useState("");
  const [shownMember, setShownMember] = useState("");
  const [restaurantId, setRestaurantId] = useState("nasi-lane");
  const [table, setTable] = useState("04");
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [session, setSession] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeBad, setNoticeBad] = useState(false);
  const [exportRows, setExportRows] = useState([]);
  const [lastAward, setLastAward] = useState(null);

  const claims = useMemo(() => identityClaims(accessToken), [accessToken]);
  const restaurant = RESTAURANTS.find((item) => item.id === restaurantId);
  const total = Math.round(cart.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
  const member = session?.members?.find((item) => item.restaurantId === restaurantId);

  async function loadList(token) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch("/api/orders", { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "The order list was rejected.");
      setNoticeBad(true);
      return;
    }
    setOrders(body.orders || []);
    setSession(body.session || null);
  }

  useEffect(() => {
    loadList(accessToken);
  }, [accessToken]);

  function addDish(dish) {
    setCart((current) => {
      const found = current.find((item) => item.name === dish.name);
      if (found) {
        return current.map((item) => item.name === dish.name ? { ...item, qty: Math.min(item.qty + 1, 9) } : item);
      }
      return [...current, { name: dish.name, price: dish.price, qty: 1 }];
    });
  }

  function changeQty(name, next) {
    setCart((current) => current.flatMap((item) => {
      if (item.name !== name) return [item];
      if (next < 1) return [];
      return [{ ...item, qty: next }];
    }));
  }

  async function placeOrder() {
    setNotice("");
    setNoticeBad(false);
    if (!accessToken) {
      setSignStep("phone");
      setNotice("Enter your phone number first. TideCloak keeps it.");
      setNoticeBad(true);
      return;
    }
    if (cart.length === 0) {
      setNotice("Add a dish first.");
      setNoticeBad(true);
      return;
    }
    // Token goes in the header only. The body is what we show judges as "what the restaurant received".
    const payload = {
      restaurantId,
      table,
      items: cart.map((item) => ({ name: item.name, price: item.price, qty: item.qty })),
      total,
    };
    setLastPayload(payload);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setNotice(body.error || "The restaurant rejected the order.");
      setNoticeBad(true);
      return;
    }
    setCart([]);
    setLastAward({ anonId: body.order.anonId, awarded: body.loyalty.awarded, points: body.loyalty.points });
    setNotice(`The kitchen issued ${body.loyalty.awarded} points. You now have ${body.loyalty.points} at this restaurant.`);
    loadList(accessToken);
  }

  // Demo button. A logged-in diner tries to sneak a phone number into the order. The kitchen should refuse.
  async function sendPhoneAnyway() {
    setNotice("");
    setNoticeBad(true);
    if (!accessToken) {
      setNotice("Enter your phone number first. TideCloak keeps it.");
      return;
    }
    const payload = {
      restaurantId,
      table,
      items: [{ name: "Roti Canai", price: 5, qty: 1 }],
      total: 5,
      phone: "+60123456789",
    };
    setLastPayload(payload);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setNotice(body.error || "The restaurant accepted a phone number.");
  }

  async function showExport() {
    const response = await fetch("/api/export");
    const text = await response.text();
    const lines = text.trim().split("\n").slice(1).filter(Boolean);
    setExportRows(lines.map((line) => {
      const match = line.match(/^(\d+),([^,]+),([^,]+),"([^"]*)",([^,]+),(\S+),(\d+)/);
      if (!match) return null;
      return { id: match[1], restaurant: match[2], table: match[3], items: match[4], total: match[5], anonId: match[6], points: match[7] };
    }).filter(Boolean));
  }

  function signOut() {
    setAccessToken("");
    setSession(null);
    setPhone("+60123456789");
    setOtp("");
    setShownMember("");
    setSignStep("");
    setLastAward(null);
  }

  async function verifyPhone() {
    setNotice("");
    setNoticeBad(false);
    const response = await fetch("/api/identity/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(body.error || "TideCloak did not accept that code.");
      setNoticeBad(true);
      return;
    }
    const hereMember = body.members?.find((item) => item.restaurantId === restaurantId);
    setShownMember(hereMember?.anonId || "");
    setSignStep("morph");
    window.setTimeout(() => {
      setAccessToken(body.accessToken);
      setPhone("");
      setOtp("");
      setSignStep("");
    }, 1400);
  }

  const kitchen = orders.filter((order) => order.restaurantId === restaurantId);

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="brand">CloakDine</p>
          <h1>Table service without the phone number</h1>
          <p className="hint">One tap. The phone number goes to TideCloak. The kitchen receives a member number and 10 points.</p>
        </div>
        <div className="session">
          {accessToken ? (
            <>
              <span>TideCloak session</span>
              <button type="button" onClick={signOut}>Log out</button>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => setSignStep("phone")}>Continue with phone</button>
          )}
        </div>
      </header>

      {signStep && (
        <section className="gate">
          {signStep === "phone" && (
            <form onSubmit={(event) => { event.preventDefault(); setSignStep("otp"); }}>
              <h2>Your phone number</h2>
              <p>TideCloak stores this. The restaurant does not.</p>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" aria-label="Phone number" />
              <button type="submit" className="primary">Send code</button>
            </form>
          )}
          {signStep === "otp" && (
            <form onSubmit={(event) => { event.preventDefault(); verifyPhone(); }}>
              <h2>Enter the code</h2>
              <p>Demo code from TideCloak: 1234</p>
              <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" aria-label="One-time code" />
              <button type="submit" className="primary">Verify</button>
            </form>
          )}
          {signStep === "morph" && (
            <div>
              <h2>Held by TideCloak</h2>
              <p className="struck">{phone}</p>
              <p className="member">{shownMember}</p>
              <p>The kitchen will see the member number, not the phone.</p>
            </div>
          )}
        </section>
      )}

      <main className="layout">
        <section className="menu-card">
          <div className="venue">
            <div>
              <p className="eyebrow">Guest menu · Table {table}</p>
              <h2>{restaurant.name}</h2>
            </div>
            <div className="switch">
              {RESTAURANTS.map((item) => (
                <button key={item.id} type="button" className={item.id === restaurantId ? "on" : ""} onClick={() => setRestaurantId(item.id)}>
                  {item.name}
                </button>
              ))}
              <select aria-label="Table" value={table} onChange={(event) => setTable(event.target.value)}>
                <option value="04">Table 04</option>
                <option value="12">Table 12</option>
              </select>
            </div>
          </div>

          <ul className="menu">
            {MENU.map((dish) => (
              <li key={dish.name}>
                <div>
                  <h3>{dish.name}</h3>
                  <p>{dish.note}</p>
                </div>
                <span className="price">{money(dish.price)}</span>
                <button type="button" onClick={() => addDish(dish)}>Add</button>
              </li>
            ))}
          </ul>

          <div className="bill">
            <div>
              <p className="quiet">{cart.length === 0 ? "No dishes yet." : "This check"}</p>
              <strong>{money(total)}</strong>
              <p className="member">{member ? member.anonId : "Member number appears after login"}</p>
              <p className="quiet">This order earns 10 points. You have {member ? member.points : 0} points here.</p>
              {cart.length > 0 && (
                <ul className="quiet">
                  {cart.map((item) => (
                    <li key={item.name}>
                      {item.qty} × {item.name}
                      <button type="button" onClick={() => changeQty(item.name, item.qty - 1)}>Remove one</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="actions">
              <button type="button" className="primary" onClick={placeOrder}>Send to kitchen</button>
              <button type="button" onClick={sendPhoneAnyway}>Attach a phone number</button>
            </div>
          </div>
          {notice && <p className={noticeBad ? "notice bad" : "notice"}>{notice}</p>}
        </section>

        <section className="pass">
          <div className="pass-head">
            <div>
              <p className="eyebrow">Kitchen pass</p>
              <h2>{restaurant.name}</h2>
            </div>
            <p className="points">
              <strong>{member ? member.points : 0}</strong>
              points on this guest's account
            </p>
          </div>

          <div className="tickets">
            {kitchen.map((order) => (
              <article className="ticket" key={order.id}>
                <header>
                  <span>#{order.id}</span>
                  <span>TABLE {order.table}</span>
                </header>
                <ul>
                  {order.items.map((item) => <li key={item.name}>{item.qty} × {item.name}</li>)}
                </ul>
                <footer>
                  <span>{money(order.total)}</span>
                  <span>+10 points issued</span>
                  <span>{order.anonId}</span>
                </footer>
              </article>
            ))}
          </div>
          {kitchen.length === 0 && <p className="empty">The pass is clear.</p>}

          <div className="ledger-head">
            <button type="button" className="primary" onClick={showExport}>Open the export ledger</button>
          </div>
          <p className="fine">The ledger has the order, the member number, and the 10 points issued. Name, email, and phone columns: 0.</p>
          {exportRows.length > 0 && (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Table</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Member</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map((row) => (
                  <tr key={row.id}>
                    <td>#{row.id}</td>
                    <td>{row.restaurant === "nasi-lane" ? "Nasi Lane" : "Teh House"} · {row.table}</td>
                    <td>{row.items}</td>
                    <td>RM {row.total}</td>
                    <td>{row.anonId}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <section className="proof">
        <article>
          <h3>1. Customer submitted</h3>
          <pre>{lastPayload ? JSON.stringify(lastPayload, null, 2) : "No order yet."}</pre>
          <p className="fine">Table, dishes, and total. No phone number.</p>
        </article>
        <article>
          <h3>2. TideCloak turned the person into</h3>
          <pre>{claims.sub ? `sub\n${claims.sub}\n\nmember\n${member?.anonId || "calculated after the order"}` : "Not signed in."}</pre>
          <p className="fine">Name, email, and phone stayed at TideCloak.</p>
        </article>
        <article>
          <h3>3. Restaurant knows</h3>
          <pre>{lastAward ? `member ${lastAward.anonId}\nissued ${lastAward.awarded} points\nyou now have ${lastAward.points} points` : "Nothing stored yet."}</pre>
          <p className="fine">The kitchen issued the points. It never saw a phone number.</p>
        </article>
      </section>
    </div>
  );
}

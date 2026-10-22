import { anonymousId } from "./anon.js";

// Gone when you stop `npm run dev`. Don't treat this like the shop's real database.
const orders = [];

// Prices live here, not in the browser. A Teh House drink sent to Nasi Lane is just an unknown dish.
const MENUS = {
  "nasi-lane": {
    "Nasi Lemak": 14.9,
    "Ayam Goreng": 12.5,
    "Roti Canai": 5,
  },
  "teh-house": {
    "Teh Tarik": 4.5,
    "Iced Teh Tarik": 4.5,
    "Kaya Toast": 6.5,
  },
};

const RESTAURANTS = new Set(["nasi-lane", "teh-house"]);
// Always 10, not a cut of the bill. Easier to point at on camera.
const POINTS_PER_ORDER = 10;
// Phone, name, and the member number are not fields. The browser does not get to invent the member number.
const ALLOWED = ["restaurantId", "table", "items", "total"];
const ITEM_ALLOWED = ["name", "price", "qty"];

function looksLikePersonalData(value) {
  return /@/.test(value) || /\+?\d[\d\s()-]{7,}/.test(value);
}

function loyaltyFor(restaurantId, anonId) {
  const mine = orders.filter((order) => order.restaurantId === restaurantId && order.anonId === anonId);
  return { visits: mine.length, points: mine.length * POINTS_PER_ORDER, awarded: POINTS_PER_ORDER };
}

export function createOrder(body, sub) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, error: "Order must be an object." };
  }

  const extra = Object.keys(body).filter((key) => !ALLOWED.includes(key));
  if (extra.length > 0) {
    return { status: 400, error: `Rejected fields: ${extra.join(", ")}` };
  }
  for (const key of ALLOWED) {
    if (!(key in body)) return { status: 400, error: `Missing ${key}.` };
  }
  if (!RESTAURANTS.has(body.restaurantId)) return { status: 400, error: "Unknown restaurant." };
  if (typeof body.table !== "string" || !/^(04|12)$/.test(body.table)) {
    return { status: 400, error: "Table must be 04 or 12." };
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 6) {
    return { status: 400, error: "Add at least one dish." };
  }

  let expected = 0;
  for (const item of body.items) {
    if (!item || typeof item !== "object") return { status: 400, error: "Each dish needs a name and quantity." };
    const extraItem = Object.keys(item).filter((key) => !ITEM_ALLOWED.includes(key));
    if (extraItem.length > 0) {
      return { status: 400, error: `Rejected item fields: ${extraItem.join(", ")}` };
    }
    const price = MENUS[body.restaurantId][item.name];
    if (price === undefined) return { status: 400, error: "Unknown dish." };
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 9) {
      return { status: 400, error: "Quantity must be from 1 to 9." };
    }
    if (item.price !== price) return { status: 400, error: "Dish price does not match the menu." };
    expected += price * item.qty;
  }
  expected = Math.round(expected * 100) / 100;
  if (typeof body.total !== "number" || Math.abs(body.total - expected) > 0.001) {
    return { status: 400, error: "Total does not match the menu." };
  }
  // A phone number hidden inside a dish name still fails.
  if (looksLikePersonalData(JSON.stringify(body))) {
    return { status: 400, error: "Personal data is not accepted." };
  }

  const order = {
    id: 1000 + orders.length + 1,
    restaurantId: body.restaurantId,
    table: body.table,
    items: body.items.map((item) => ({ name: item.name, qty: item.qty, price: item.price })),
    total: expected,
    // Same person at Nasi Lane and Teh House gets two different numbers, so the exports don't line up.
    anonId: anonymousId(sub, body.restaurantId),
  };
  orders.push(order);
  return { status: 201, order, loyalty: loyaltyFor(order.restaurantId, order.anonId) };
}

export function sessionFor(sub) {
  return {
    members: [...RESTAURANTS].map((restaurantId) => {
      const anonId = anonymousId(sub, restaurantId);
      const row = loyaltyFor(restaurantId, anonId);
      return { restaurantId, anonId, visits: row.visits, points: row.points };
    }),
  };
}

export function listOrders() {
  return {
    orders,
    loyalty: summarize(),
  };
}

function summarize() {
  const groups = new Map();
  for (const order of orders) {
    const key = `${order.restaurantId}|${order.anonId}`;
    const current = groups.get(key) || { restaurantId: order.restaurantId, anonId: order.anonId, visits: 0, points: 0 };
    current.visits += 1;
    current.points += POINTS_PER_ORDER;
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function exportCsv() {
  const lines = ["order_id,restaurant,table,items,total_rm,anon_id,points_issued"];
  for (const order of orders) {
    const items = order.items.map((item) => `${item.qty}x ${item.name}`).join("; ");
    lines.push([order.id, order.restaurantId, order.table, `"${items}"`, order.total.toFixed(2), order.anonId, POINTS_PER_ORDER].join(","));
  }
  return lines.join("\n") + "\n";
}

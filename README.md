[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

# CloakDine

A diner orders at the table and keeps loyalty points, while the restaurant never receives a phone number, name, or email.

## Vision & originality

CloakDine is a QR table-order page. The kitchen still gets the ticket, and a return visit still adds points. The restaurant knows the diner only as an anonymous member number. That number stays the same at one restaurant and changes at the next, so two venues cannot line their exports up.

## Trust constraint insight

A table QR usually asks for a mobile number, and the point-of-sale database keeps it. A manager, a dishonest employee, or a stolen backup can export the list. Diners skip the form, and the restaurant holds numbers it can lose.

## Value & impact

At Nasi Lane, Mira orders and earns points for next time. The kitchen sees the table, the dishes, and a member number. The export has nothing to call and no name to attach. The same person at Teh House starts a separate membership.

## Why TideCloak matters

The diner enters a phone number and code 1234. TideCloak stores the number and returns a token whose only identity claim is sub. The restaurant checks that token, issues 10 points to the member number, and discards the token. A phone number added to the order is rejected.

## Prototype & storytelling

Choose Continue with phone, enter +60123456789, then 1234. The phone is crossed out and a member number appears. Send an order at Nasi Lane. The guest and the kitchen both show 10 points. Switch to Teh House: the number changes and points start over. Switch back: the first points remain. The export has no phone column.

## Setup

TideCloak and this app run on your machine. Orders stay in memory and disappear when the app stops.

```bash
docker run -d --name mytidecloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=password \
  tideorg/tidecloak-dev:latest

npm install
npm run setup
npm run dev
```

Open http://localhost:5174 and log in as `mira` / `password`.

The two-minute demo video is `demo.mp4` in this repository.

A new diner clicks **Log in with TideCloak**, then **Register** on the TideCloak page. The phone number stays on that page. TideCloak sends them back to http://localhost:5174.

`npm run setup` turns registration on, creates the `cloakdine` realm, a public client, and the demo user, then writes `public/tidecloak.json`. That file is not committed. The admin console is http://localhost:8080 (`admin` / `password`). The demo account's profile has a phone number. The restaurant export does not.

Team `RMITMELTrustUsBro_C2`.

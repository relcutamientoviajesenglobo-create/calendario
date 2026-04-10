# Correo para solicitar API key a Bookeo

**Para:** api@bookeo.com
**Asunto:** API key request — WE FLY (2 Bookeo accounts, balloon operator Mexico)

---

Hi Bookeo API Team,

I'm the operator of WE FLY, a hot-air balloon company flying in San Juan Teotihuacán, Mexico. We run two separate Bookeo accounts for our two brands:

1. **Globos Aerostáticos Teotihuacán** — account email: weflymx@gmail.com
2. **Vuelos en Globo MX** — account email: weflymx@gmail.com (same login, different portal)

I would like to request an **API key** for each account so we can programmatically read bookings and sync them into our internal dispatch dashboard (reading only — we do not intend to write bookings back to Bookeo).

**What we want to build:**

- A daily reconciliation tool that pulls today/tomorrow bookings from both Bookeo accounts and merges them with our Turitop and Viator bookings into a single dispatch view for the pilot and driver team.
- A morning briefing with passenger counts, pickup addresses, and special requests, automatically sent to the operations WhatsApp group.
- No writes, no modifications to bookings from our side — read-only consumption of the standard Bookeo REST API (`/bookings`, `/holds`, `/customers` endpoints).

**Technical details:**

- Client: a Python backend (`requests` library) running on our own infrastructure.
- Expected call volume: ~50 calls per day per account (polling every hour during business hours).
- We already have the `secretKey` visible in our account settings — we only need the corresponding `apiKey` to complete the authentication.
- Happy to whitelist source IPs if needed.

Could you please issue the apiKey for both accounts, or let me know what additional information you need from me?

Thanks very much for your help,

Josh
WE FLY — Globos Aerostáticos Teotihuacán / Vuelos en Globo MX
weflymx@gmail.com

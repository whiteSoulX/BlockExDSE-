"""
Simulated exchange profiles. One settlement contract is deployed per market (own currency, own cash and holdings).

DSE facts used (EFG Hermes DSE market page, Midway Securities, tradinghours.com): Sunday-Thursday, continuous trading
10:00-14:20, post-trade 14:20-14:30, BDT, tick 0.10 BDT, no board lots, price-slab circuit breakers.
LSE facts used (London Stock Exchange SETS descriptions): order book with price-time priority, opening auction
07:50-08:00, continuous 08:00-16:30, closing auction 16:30-16:35 London time, prices quoted in pence.

Everything else is a SIMULATION PARAMETER: reference prices are illustrative (not live), prices are whole numbers (no
decimal ticks), and the LSE +/-10% band is a stand-in for its price-monitoring auctions. Check real rules before quoting.
"""

DSE_SLABS = [(200, 0.10), (500, 0.0875), (1000, 0.075), (2000, 0.0625), (5000, 0.05)]   # (up to price, band)


def band(cfg, ref):
    """Allowed one-day price move around the reference price, as a fraction."""
    if cfg["band"] == "slab":
        for upto, b in DSE_SLABS:
            if ref <= upto:
                return b
        return 0.0375
    return float(cfg["band"])


def band_bps(cfg, ref):
    """The same band as an integer number of basis points (what the contract stores)."""
    return int(round(band(cfg, ref) * 10000))


MARKETS = {
    "DSE": {
        "code": "DSE", "name": "Dhaka Stock Exchange", "country": "Bangladesh", "currency": "BDT",
        "hours": "Sun to Thu, 10:00 to 14:20 continuous (post-trade to 14:30), Dhaka time",
        "model": "Continuous order book, price-time priority; circuit-breaker bands by price slab",
        "band": "slab", "tick_note": "Real tick is 0.10 BDT; the prototype uses whole taka",
        "fmt": {"div": 1, "prefix": "", "suffix": " BDT", "price_suffix": "", "dec": 0},
        "risk_notional": 500_000, "max_qty": 10_000,     # max_qty: "fat finger" cap, checked only at the edge
        "demo_cash": 5_000_000, "demo_shares": 500, "new_cash": 1_000_000, "new_shares": 100,
        # v2.1 practice wallet (simulated payments; amounts in BDT)
        "wallet": {"methods": ["bkash", "nagad", "rocket", "bank"], "min": 500, "max": 500_000},
        "tickers": {                                     # reference prices are ILLUSTRATIVE; "w" = weight in the demo index
            "GP": {"name": "Grameenphone", "ref": 300, "sector": "Telecommunication", "about": "Mobile phone and internet operator", "w": 18},
            "ROBI": {"name": "Robi Axiata", "ref": 28, "sector": "Telecommunication", "about": "Mobile phone and internet operator", "w": 6},
            "BRACBANK": {"name": "BRAC Bank", "ref": 45, "sector": "Bank", "about": "Commercial bank", "w": 6},
            "CITYBANK": {"name": "The City Bank", "ref": 22, "sector": "Bank", "about": "Commercial bank", "w": 3},
            "EBL": {"name": "Eastern Bank", "ref": 25, "sector": "Bank", "about": "Commercial bank", "w": 3},
            "SQURPHARMA": {"name": "Square Pharmaceuticals", "ref": 220, "sector": "Pharmaceuticals", "about": "Medicine maker", "w": 12},
            "RENATA": {"name": "Renata", "ref": 600, "sector": "Pharmaceuticals", "about": "Medicine maker", "w": 5},
            "BXPHARMA": {"name": "Beximco Pharmaceuticals", "ref": 90, "sector": "Pharmaceuticals", "about": "Medicine maker", "w": 4},
            "BATBC": {"name": "British American Tobacco Bangladesh", "ref": 380, "sector": "Food and allied", "about": "Tobacco products", "w": 10},
            "OLYMPIC": {"name": "Olympic Industries", "ref": 140, "sector": "Food and allied", "about": "Biscuits and snacks", "w": 3},
            "MARICO": {"name": "Marico Bangladesh", "ref": 2300, "sector": "Food and allied", "about": "Hair care and personal care", "w": 5},
            "UPGDCL": {"name": "United Power Generation", "ref": 130, "sector": "Fuel and power", "about": "Power generation", "w": 5},
            "TITASGAS": {"name": "Titas Gas", "ref": 30, "sector": "Fuel and power", "about": "Gas transmission and distribution", "w": 2},
            "WALTONHIL": {"name": "Walton Hi-Tech", "ref": 500, "sector": "Engineering", "about": "Electronics and appliances", "w": 10},
            "LHBL": {"name": "LafargeHolcim Bangladesh", "ref": 60, "sector": "Cement", "about": "Cement maker", "w": 8},
        },
    },
    "LSE": {
        "code": "LSE", "name": "London Stock Exchange", "country": "United Kingdom", "currency": "GBX",
        "hours": "Mon to Fri, opening auction 07:50, continuous 08:00 to 16:30, closing auction to 16:35, London time",
        "model": "SETS order book, price-time priority; auctions open and close the day",
        "band": 0.10, "tick_note": "Prices in pence (GBX). Simulated +/-10% guard stands in for price-monitoring auctions",
        "fmt": {"div": 100, "prefix": "£", "suffix": "", "price_suffix": "p", "dec": 2},
        "risk_notional": 20_000_000, "max_qty": 10_000,    # risk_notional in pence, i.e. 200,000 GBP
        "demo_cash": 50_000_000, "demo_shares": 500, "new_cash": 10_000_000, "new_shares": 100,
        # v2.1 practice wallet (simulated payments; amounts in pence)
        "wallet": {"methods": ["bank", "card"], "min": 1_000, "max": 500_000},
        "tickers": {
            "HSBA": {"name": "HSBC Holdings", "ref": 900, "sector": "Banks", "about": "International bank"},
            "SHEL": {"name": "Shell", "ref": 2700, "sector": "Energy", "about": "Oil, gas and energy"},
            "AZN": {"name": "AstraZeneca", "ref": 11500, "sector": "Pharmaceuticals", "about": "Medicine maker"},
            "ULVR": {"name": "Unilever", "ref": 4500, "sector": "Consumer goods", "about": "Food, home and personal care brands"},
            "VOD": {"name": "Vodafone Group", "ref": 75, "sector": "Telecommunication", "about": "Mobile and broadband operator"},
        },
    },
}

# Hidden market used only by the benchmark (never shown in the dashboard). Large balances so cash never limits the test.
MARKETS["BNC"] = {
    "code": "BNC", "name": "Benchmark market", "country": "-", "currency": "BDT", "hidden": True,
    "hours": "n/a", "model": "Benchmark only", "band": "slab", "tick_note": "",
    "fmt": {"div": 1, "prefix": "", "suffix": " BDT", "price_suffix": "", "dec": 0},
    "risk_notional": 500_000, "max_qty": 1_000, "demo_cash": 10 ** 15, "demo_shares": 10 ** 9, "new_cash": 0, "new_shares": 0,
    "restricted": ["Grace"],                               # KYC-registered, then frozen by compliance: only the edge knows
    "tickers": {"B1": {"name": "Bench one", "ref": 300}, "B2": {"name": "Bench two", "ref": 50}},
}

CHAIN_NAMES = {31337: "Hardhat local test chain", 1337: "Local test chain", 11155111: "Ethereum Sepolia testnet",
               80002: "Polygon Amoy testnet", 84532: "Base Sepolia testnet", 421614: "Arbitrum Sepolia testnet",
               1: "Ethereum MAINNET (real money!)", 137: "Polygon MAINNET (real money!)"}

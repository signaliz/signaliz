#!/usr/bin/env python3
"""
Find 500 Retail CEOs using the Blitz API.

Two-step approach:
  1. Company Search — find retail companies (paginated, cursor-based)
  2. Employee Finder — find CEO/C-level at each company

Usage:
  export BLITZ_API_KEY="your_key_here"
  python3 scripts/find_retail_ceos.py

Output:
  results/retail_ceos.csv
"""

import csv
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "https://api.blitz-api.ai/v2"
API_KEY = os.environ.get("BLITZ_API_KEY", "")
TARGET_CEOS = 500
COMPANY_PAGE_SIZE = 25  # per Blitz API docs
RATE_LIMIT_WAIT = 0.25  # 4 req/s to stay under 5/s limit
MAX_RETRIES = 3
BACKOFF = [5, 10, 20]

# Retail-related LinkedIn industry values (case-sensitive, normalized)
RETAIL_INDUSTRIES = [
    "Retail",
    "Retail Apparel and Fashion",
    "Retail Groceries",
    "Retail Health and Personal Care Products",
    "Retail Luxury Goods and Jewelry",
    "Retail Motor Vehicles",
    "Retail Office Equipment",
    "Retail Furniture and Home Furnishings",
    "Retail Art Supplies",
    "Retail Books and Printed News",
    "Retail Building Materials and Garden Equipment",
    "Retail Recyclable Materials and Used Merchandise",
    "Retail Musical Instruments",
    "Retail Gasoline",
    "Online and Mail Order Retail",
    "Food and Beverage Retail",
]


def api_request(endpoint: str, body: dict) -> dict:
    """Make a POST request to the Blitz API with retry logic."""
    url = f"{BASE_URL}/{endpoint}"
    data = json.dumps(body).encode("utf-8")
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }

    for attempt in range(MAX_RETRIES):
        try:
            req = Request(url, data=data, headers=headers, method="POST")
            with urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            if e.code == 429:
                wait = 30
                print(f"  Rate limited (429). Waiting {wait}s...")
                time.sleep(wait)
            elif e.code in (500, 502, 503):
                wait = BACKOFF[attempt]
                print(f"  Server error ({e.code}). Retry {attempt+1}/{MAX_RETRIES} in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}")
                raise
        except URLError as e:
            wait = BACKOFF[attempt]
            print(f"  Network error: {e.reason}. Retry {attempt+1}/{MAX_RETRIES} in {wait}s...")
            time.sleep(wait)

    raise RuntimeError(f"Failed after {MAX_RETRIES} retries: {endpoint}")


def search_retail_companies(target_count: int) -> list[dict]:
    """Find retail companies using Company Search with cursor pagination."""
    print(f"\n--- Step 1: Finding retail companies (need ~{target_count}) ---")
    companies = []
    cursor = None
    page = 0

    while len(companies) < target_count:
        page += 1
        body = {
            "industry": {"include": RETAIL_INDUSTRIES},
            "page_size": COMPANY_PAGE_SIZE,
        }
        if cursor:
            body["cursor"] = cursor

        print(f"  Page {page}: fetching companies (have {len(companies)} so far)...")
        try:
            resp = api_request("search/companies", body)
        except Exception as e:
            print(f"  Error on page {page}: {e}")
            break

        results = resp.get("results", [])
        cursor = resp.get("cursor")

        if not results:
            print("  No more results.")
            break

        for co in results:
            companies.append({
                "company_name": co.get("name", ""),
                "company_linkedin_url": co.get("linkedin_url", ""),
                "company_domain": co.get("domain", ""),
                "industry": co.get("industry", ""),
                "employee_count": co.get("employee_count", ""),
                "hq": co.get("hq", ""),
            })

        print(f"  Got {len(results)} companies. Total: {len(companies)}")

        if cursor is None:
            print("  Last page reached.")
            break

        time.sleep(RATE_LIMIT_WAIT)

    print(f"  Found {len(companies)} retail companies total.")
    return companies[:target_count]


def find_ceo_at_company(company_linkedin_url: str) -> list[dict]:
    """Find CEO/C-level employees at a company using Employee Finder."""
    body = {
        "company_linkedin_url": company_linkedin_url,
        "job_level": ["C-Team"],
        "page_size": 5,
    }

    try:
        resp = api_request("search/employee-finder", body)
    except Exception:
        return []

    results = resp.get("results", [])
    ceos = []
    for person in results:
        title = (person.get("title") or "").lower()
        # Prioritize actual CEOs, but accept all C-level
        ceos.append({
            "first_name": person.get("first_name", ""),
            "last_name": person.get("last_name", ""),
            "title": person.get("title", ""),
            "linkedin_url": person.get("linkedin_url", ""),
            "is_ceo": "chief executive" in title or title.startswith("ceo"),
        })

    # Sort so actual CEOs come first
    ceos.sort(key=lambda x: not x["is_ceo"])
    return ceos


def main():
    if not API_KEY:
        print("ERROR: Set BLITZ_API_KEY environment variable.")
        print("  export BLITZ_API_KEY='your_key_here'")
        sys.exit(1)

    # We'll search more companies than needed since not every company will have a CEO result
    companies = search_retail_companies(target_count=TARGET_CEOS * 3)

    if not companies:
        print("No companies found. Check your API key and filters.")
        sys.exit(1)

    print(f"\n--- Step 2: Finding CEOs at {len(companies)} companies ---")
    ceo_records = []
    companies_checked = 0

    for co in companies:
        if len(ceo_records) >= TARGET_CEOS:
            break

        linkedin_url = co["company_linkedin_url"]
        if not linkedin_url:
            continue

        companies_checked += 1
        if companies_checked % 25 == 0:
            print(f"  Checked {companies_checked} companies, found {len(ceo_records)} CEOs...")

        people = find_ceo_at_company(linkedin_url)

        if people:
            # Take the top result (actual CEO preferred)
            person = people[0]
            ceo_records.append({
                "first_name": person["first_name"],
                "last_name": person["last_name"],
                "title": person["title"],
                "person_linkedin_url": person["linkedin_url"],
                "company_name": co["company_name"],
                "company_linkedin_url": co["company_linkedin_url"],
                "company_domain": co["company_domain"],
                "industry": co["industry"],
                "employee_count": co["employee_count"],
                "hq": co["hq"],
            })

        time.sleep(RATE_LIMIT_WAIT)

    print(f"\n  Found {len(ceo_records)} retail CEOs from {companies_checked} companies checked.")

    # Write CSV output
    os.makedirs("results", exist_ok=True)
    output_path = os.path.join("results", "retail_ceos.csv")
    fieldnames = [
        "first_name", "last_name", "title", "person_linkedin_url",
        "company_name", "company_linkedin_url", "company_domain",
        "industry", "employee_count", "hq",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ceo_records)

    print(f"\n--- Done! ---")
    print(f"  Output: {output_path}")
    print(f"  Total CEOs: {len(ceo_records)}")
    print(f"  Companies searched: {companies_checked}")


if __name__ == "__main__":
    main()

# Local SEO plan: The Pet Physio Vet (Shilaj, Ahmedabad)

Date: 2026-10-08. Branch `feat/local-seo`. Research and plan only. No site code was changed.

Builds on `docs/agency/seo-keyword-map.md` (2026-10-07) and `docs/agency/offsite-checklist.md` (2026-10-07). This plan does not repeat them. It adds the local layer: localities, the missing boarding, grooming and swimming content, Map Pack work, and a timeline.

## 0. Ground rules and data caveats

- **No measured volumes or positions.** There is no Search Console (not verified yet), Ahrefs or Semrush. Every "volume" and "difficulty" below is a **qualitative estimate** from intent and from who shows up in search results. Replace the estimates with Search Console data 4 to 8 weeks after verification.
- **The search tool is not Google.** "Who ranks" observations come from a general web-search API run on 2026-10-08. It does not show the Google Map Pack and does not honour location. Treat them as an indication of which pages and listings exist and are indexed, not as Google positions. Before acting on any competitor claim, check it with a manual incognito Google search with the location set to Shilaj.
- **New domain.** The domain was registered 2026-09-27. The Google Business Profile (GBP, Maps CID 16829298020285027612) is older and already has 24 reviews at 5.0, so **the GBP is the asset that can rank soonest.** The website will take months to build authority. SEO compounds; nothing here guarantees a position.
- **White-hat only.** No area doorway pages, no keyword-stuffed GBP name, no incentivised reviews.

---

## 1. Current state (verified live, 2026-10-08)

| Check | Result | Evidence |
|---|---|---|
| Homepage status / canonical | 200, self-canonical `https://www.thepetphysiovet.com/`, `lang="en-IN"`, `index, follow` | `curl -A Googlebot` |
| Rendering | Prerendered HTML, about 1,886 words on the homepage. All condition and treatment content is present without JS. | curl body parse |
| **Boarding / swimming / grooming / walking in HTML** | **Absent. "Boarding", "Grooming", "Swimming", "Walking", "Indoor Facility" each appear 0 times in the crawlable homepage HTML.** `BookableServices` renders only codes returned by the live `/appointment-options` API (`availableCodes={publicServiceCodes}` in `landing/src/pages/HomePage.tsx`), so the prerender has none. | curl count; `HomePage.tsx` line ~117 |
| robots.txt | Allows all; blocks /app, /admin, /api and tracking params; declares the sitemap. Fine. | `/robots.txt` |
| sitemap.xml | 18 URLs, all canonical www, all 200. No boarding, grooming or swimming URL exists. | `/sitemap.xml` |
| llms.txt | Lists conditions, the 6 therapy modalities and the clinician. **No boarding, grooming, swimming, walking, prices or home-visit areas.** | `/llms.txt` |
| Host redirects | `http://thepetphysiovet.com` → `https://thepetphysiovet.com` → `https://www.` is a **2-hop chain**. Apex https → www is 1 hop (308). | `curl -I` |
| Schema (home) | Organization, WebSite, VeterinaryCare+MedicalBusiness+LocalBusiness, WebPage, BreadcrumbList, 6 Service, Person, FAQPage. areaServed = 7 AdministrativeArea names. No Service nodes for boarding, grooming, swimming or walking. No AggregateRating (correct: self-serving). | JSON-LD parse |
| areaServed | Ahmedabad, Shilaj, Thaltej, Bodakdev, Science City, Sola, Gota. **Omits Bopal, South Bopal and Ambli, which sit next to Shilaj, yet includes Gota, which is further away.** Owner to confirm the real home-visit list. | `siteConfig.ts` |
| Hours | Site: Mon to Sat 09:30 to 13:30, physiotherapy by appointment. `bookableServices.ts` says boarding is 24x7. The 2026-10-07 audit saw "closes 7:30 pm" on the GBP. **Three possibly conflicting hours statements.** | footer, `siteConfig.ts`, `bookableServices.ts` |
| Email | Cloudflare email obfuscation turns the visible email into `[email protected]` for non-JS crawlers. Low impact (email is not part of NAP matching). | curl body (`/cdn-cgi/l/email-protection`) |
| Images | 33 `<img>`, all with explicit width and height; content images have descriptive alt text; the 3 logo images have empty alt (fine if decorative). | parse |
| Core Web Vitals (lab only) | Local Lighthouse 12, mobile, simulated throttling, single run: **Performance 56, LCP 6.2 s, CLS 0.184, TBT 130 ms, FCP 3.1 s, page weight 6.5 MB.** LCP element = the intro-overlay logo `img.intro-l`. CLS culprit = `section#home > div.relative` (hero). Heaviest: `reels/reel-labrador-hydrotherapy-loop.mp4` 1.8 MB, `hero-loop.mp4` 1.7 MB, `reel-pool-recovery-loop.mp4` 1.0 MB, two more reels 0.9 MB. Lighthouse SEO score 100. The PageSpeed Insights API returned "quota exceeded", so there is **no field (CrUX) data**. A new site will not have any for weeks. Targets ("good" at p75, web.dev): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. | `npx lighthouse@12` |
| Brand visibility | A search for "The Pet Physio Vet" Ahmedabad returned no result for the site or the clinic. Expected for a 2-week-old domain that is not yet in Search Console. | [search 1] |

---

## 2. Locality research: what is actually near Shilaj

Distances below are **rough road estimates for planning**. Check each on Google Maps from the clinic pin before publishing any of them. Only localities the clinic **actually visits** go on the site or GBP.

| Locality | Rough distance from clinic | Relation | Recommend on site/GBP? |
|---|---|---|---|
| Shilaj | 0 km | Clinic locality | Yes (already) |
| Thaltej | ~1 to 3 km | Clinic is on Thaltej–Shilaj Road | Yes (already) |
| Ambli / Ambli–Bopal Road | ~1 to 3 km | Adjacent (Ambli Road station ~1 km per Mapcarta) | **Add, if visited** |
| Bopal | ~2 to 4 km | Adjacent (Bopal bus stand ~2 km) | **Add, if visited** |
| South Bopal | ~3 to 5 km | Next to Bopal | **Add, if visited** |
| Sindhu Bhavan Road | ~3 to 4 km | Between Thaltej and Bodakdev | Optional, if visited |
| SG Highway (Thaltej–Sola stretch) | ~3 to 5 km | Arterial road, used as a locality by searchers | Optional; a road, not an area |
| Bodakdev | ~4 to 5 km | Near | Yes (already) |
| Science City / Sola | ~4 to 6 km | Science City bus stand ~4 km | Yes (already) |
| Vastrapur | ~6 to 7 km | Further east | Only if visited |
| Satellite / Prahlad Nagar | ~7 to 9 km | South-east | Only if visited |
| Gota | ~8 to 10 km | North, further than Bopal | Keep only if actually visited |

Sources: [Mapcarta, Ambli Road station](https://mapcarta.com/14903324); [Mapcarta](https://mapcarta.com/14859776); Shilaj, Bopal and Science City distances from [search 11]. Context: AMC reported 19,756 registered pet dogs in Aug 2026, and "western parts of Ahmedabad account for the largest share", which is the clinic's side of the city. Labrador (3,939), German Shepherd, Shih Tzu, Golden Retriever and Pomeranian are the top breeds ([Telangana Today, 5 Aug 2026](https://telanganatoday.com/ahmedabad-registers-nearly-20000-pet-dogs-labradors-remain-the-citys-most-popular-breed)). Labradors and German Shepherds are hip-dysplasia and arthritis breeds, so this is a good content angle.

**Competitor service-area signal:** Dr. C.M.'s Pet Clinic (South Bopal) publicly lists Bopal, South Bopal, Shilaj, Thaltej, Ambli, Satellite, Prahladnagar, SG Highway and others ([GBP post](https://business.google.com/v/dr-c-m-s-pet-clinic/08525163697167224886/e4d8/_/lp/8094345043747450863/)). That is the same catchment.

---

## 3. Keyword research

Columns: **Vol** = estimated relative demand (H/M/L, *estimate, no tool*). **Diff** = qualitative difficulty from the competitors seen. **Pri**: A = now, B = next, C = opportunistic, GBP = win through the Map Pack, not a site page.

### 3.1 Head and "near me" terms

| Keyword (and variants) | Intent | Vol (est.) | Diff (est.) | Who shows today (search tool, indicative) | Target | Pri |
|---|---|---|---|---|---|---|
| pet vet ahmedabad; vet in ahmedabad; dog doctor ahmedabad; animal doctor ahmedabad | Local transactional (general vet: vaccines, sickness) | H | High | Dr. C.M.'s Pet Clinic GBP posts dominate (10 of 10 results) [1]; Drlogy and DocIndia vet profiles [5] | **GBP** (Map Pack). Site: homepage secondary only. | GBP |
| vet near me; pet clinic near me; dog clinic near me (searched from Shilaj/Thaltej/Bopal) | Local transactional; Google resolves by distance | H | Med near Shilaj, very high citywide | Map Pack (not observable with this tool). Organic: Dr. C.M.'s, Dr. Chirag Dave's Pets Clinic (Thaltej–Shilaj Rd), Sneh Pet Clinic (Thaltej) [5] | **GBP** | GBP |
| vet shilaj; pet clinic shilaj; veterinary clinic thaltej; dog doctor bopal | Local transactional | M | Med | Dr. Chirag Dave's Pets Clinic (Drlogy), Dr. C.M.'s (GBP) [5][14] | GBP + homepage NAP/landmark copy | GBP/A |
| pet hospital ahmedabad; 24 hour vet ahmedabad; emergency vet ahmedabad | Urgent | M | High | General hospitals, Sneh Pet Clinic (24 h) [5] | **Do not target.** The site correctly says it is not an emergency hospital. | X |

### 3.2 Core niche (the website can win these)

| Keyword (and variants) | Intent | Vol (est.) | Diff (est.) | Who shows today | Target URL | Pri |
|---|---|---|---|---|---|---|
| dog physiotherapy ahmedabad; pet physiotherapy ahmedabad; animal physiotherapy ahmedabad; veterinary physiotherapist ahmedabad | Commercial/local | M | **Low**. No Ahmedabad vet-physio page found; results are human physio clinics, a 2016 POSH Foundation story, and Vetic's Gurgaon page [2][6] | `/` | **A** |
| pet rehabilitation centre ahmedabad; dog rehab ahmedabad | Commercial/local | L-M | Low | Same as above [6] | `/` | A |
| dog hydrotherapy ahmedabad; hydrotherapy for dogs ahmedabad | Commercial/local | L-M | **Low**. Only generic global articles (AKC, Wikipedia, RVC) [3] | `/treatments/hydrotherapy` | **A** |
| dog swimming pool ahmedabad; pet swimming ahmedabad; swimming for dogs near me | Local, part recreational | M | Med. Doggy Hotel ("Puppy Pool"), Homegrown's "7 pools" list [10] | `/treatments/hydrotherapy` (add a priced "Swimming sessions" section; **do not** make a second page, see §5) | **A** |
| dog paralysis treatment ahmedabad; dog back legs not working; dog hind legs weakness; dog cannot walk | Problem/commercial | M | Low locally | POSH Foundation (Better India), The Quint, generic pages [6][9] | `/conditions/neurological-recovery` | **A** |
| IVDD treatment dog ahmedabad; slipped disc dog treatment | Problem/commercial | L-M | Low locally | Generic UK/global [keyword map §2] | `/conditions/ivdd` | A |
| dog physiotherapy at home ahmedabad; vet home visit ahmedabad; pet physio at home | Local transactional | L-M | Med. Dr. C.M.'s advertises vaccination home visits [12] | `/treatments/home-care` | **A** |
| dog acupuncture ahmedabad; veterinary acupuncture ahmedabad | Commercial | L | Low (Dr. Patel holds a CVA) | none local seen | `/treatments/acupuncture` | B |
| laser therapy for dogs ahmedabad | Commercial | L | Low | none local seen | `/treatments/electrophysical` | B |
| TPLO / cruciate rehab dog; post surgery dog physiotherapy ahmedabad | Problem | L | Low | generic | `/conditions/post-surgical` | B |
| dog arthritis treatment ahmedabad; hip dysplasia dog treatment; old dog not walking | Problem | M | Low-Med | generic | existing condition pages | B |

### 3.3 Secondary services (real, priced and bookable, but currently invisible to crawlers)

| Keyword (and variants) | Intent | Vol (est.) | Diff (est.) | Who shows today | Target URL | Pri |
|---|---|---|---|---|---|---|
| pet boarding shilaj; dog boarding ahmedabad; pet boarding near me; dog hostel ahmedabad | Local transactional | M-H | **Med-High**. Doggy Hotel (4.8 Google), Simba's Pride Bodakdev (Yappe, 4.8/64), Pet Inn, Scooby's The Dog Resort, Champ Dog Kennel, Dog Holiday Home [4][13] | **New** `/services/pet-boarding` + GBP secondary category | **A** (owner priority) |
| dog day care ahmedabad; dog daycare bodakdev / thaltej | Local transactional | M | Med | Simba's Pride, Doggy Hotel [13] | same boarding page (H2) | B |
| dog grooming shilaj / thaltej / bodakdev; pet grooming near me | Local transactional | M | Med. Groomers and general clinics (Dr. C.M.'s, Sneh) [7][5] | **New** `/services/dog-grooming` + GBP secondary | B |
| dog walker ahmedabad | Local transactional | L | Low-Med | none clear | boarding page H2 + GBP service item; no page | C |

### 3.4 Brand

| Keyword | Target | Pri |
|---|---|---|
| the pet physio vet; pet physio vet ahmedabad / shilaj | `/` + GBP | A |
| dr dhanvi patel; dhanvi patel vet | `/team/dhanvi-patel` | A |

### 3.5 Gujarati / Hindi / Hinglish forms

Romanised Gujarati/Hindi searches ("kutra na doctor", "kutte ka doctor", "kutta paralysis ilaj", "pashu dawakhana") returned nothing local for the niche [15]. Searches typed in Gujarati script (કૂતરાના ડોક્ટર અમદાવાદ, પશુ દવાખાનું) could not be measured. **Recommendation: no gu-IN or hi-IN page set now** (translation upkeep, thin duplicates, hreflang overhead for unproven demand). Instead:
- Answer 2 to 3 FAQs with a natural Gujarati/Hindi line (e.g., "Kutra na pachhla paga ma lakvo / kamzori"), only if the owner or staff confirm the wording and that consultations happen in Gujarati/Hindi.
- Revisit at day 90. If Search Console shows Gujarati-script or Hinglish queries with impressions, build properly translated `gu-IN` versions of the top 3 pages with reciprocal hreflang plus `x-default`.

### 3.6 Top 10 to focus on

1. dog physiotherapy ahmedabad (`/`)
2. dog hydrotherapy ahmedabad + dog swimming pool ahmedabad (`/treatments/hydrotherapy`)
3. pet boarding shilaj / dog boarding ahmedabad (new `/services/pet-boarding`, GBP)
4. dog paralysis treatment ahmedabad (`/conditions/neurological-recovery`)
5. pet vet ahmedabad / vet near me from nearby areas (GBP)
6. dog physiotherapy at home ahmedabad / vet home visit (`/treatments/home-care`)
7. IVDD treatment dog ahmedabad (`/conditions/ivdd`)
8. pet physiotherapy / animal physiotherapy ahmedabad (`/`)
9. dog grooming shilaj / thaltej (new `/services/dog-grooming`, GBP)
10. dog acupuncture ahmedabad (`/treatments/acupuncture`)

---

## 4. Gap analysis by cluster

| Cluster | Title/H1/meta today | Body/content gap | Internal links | Schema | llms.txt | Verdict |
|---|---|---|---|---|---|---|
| Physio core (`/`) | Title "Dog & Cat Physiotherapy in Ahmedabad \| The Pet Physio Vet" (57), good. H1 good. Meta does not mention Shilaj, home visits, pool or boarding. | No "where we are / how to reach from Thaltej, Bopal, SG Highway" block. No crawlable list of secondary services. | Good links to all conditions and treatments. **No link to boarding, grooming or swimming (no pages exist).** | Good business node; areaServed list unconfirmed | OK | **Meta + local block** |
| Hydrotherapy / swimming | Title "Dog Hydrotherapy in Ahmedabad \| The Pet Physio Vet". No "swimming" or "pool" in title/H1. | Prices for swimming (₹1,300 single, ₹1,100 per session for 5, ₹900 per session for 8) exist in `bookableServices.ts` but are **not on the crawlable page**. | Linked from home 3x | Service node, no Offer/price | No price | **Retitle + price section** |
| Boarding / day care | None | **No crawlable content at all.** Facts available: 24x7 supervised care, 6 beds, booked by hour/day/week/month, walks and feeding to preference, Aadhaar at check-in, paid at clinic. | None | None | None | **New page (critical gap)** |
| Grooming | None | No crawlable content. Facts: shampooing ₹1,200, nail trimming ₹200, hair clipping ₹800, swim + groom + shampoo + dry ₹2,500, herbal care, oiling massage, geriatric grooming care. | None | None | None | **New page** |
| Walking | None | No crawlable content. Facts: professional walkers, urine/faeces observed, no cellphone while walking. | None | None | None | Section on boarding page |
| Home visits | Title good. H1 "Home-visit pet physiotherapy across Ahmedabad". | **Has an H2 "Home visits across Ahmedabad" but no list of the areas actually covered**, no visit charge, no visit days/times. | OK | Service with areaServed = generic list | Areas line only | **Add confirmed areas** |
| Paralysis / neuro | Title "Dog Paralysis, Ataxia & Neurological Rehab in Ahmedabad" (55), good. | 592 words, the thinnest money page. Missing "back legs not working" phrasing, a home-visit option for dogs that cannot walk, and what to expect week by week. | OK | MedicalCondition + FAQ | OK | **Expand body** |
| General vet ("pet vet ahmedabad") | Site never says whether general consultations or vaccinations are offered. FAQ1 says a referral is required "in most cases", which pushes away "vet near me" searchers. | Owner must confirm scope. | n/a | `VeterinaryCare` type is accurate (Dr. Patel is a B.V.Sc. & A.H.) | n/a | **Owner decision** |
| Hours | Footer: Mon to Sat 09:30 to 13:30 only | Boarding 24x7 not stated; GBP may show 7:30 pm | n/a | openingHoursSpecification = physio hours only | physio only | **Reconcile** |

---

## 5. Cannibalisation check (blocker; done before any copy change below)

Method: there is no Search Console data, so every URL in the sitemap was checked with title/H1/body greps for each target topic.

| Query | Competing pages | Owner | Action |
|---|---|---|---|
| dog physiotherapy ahmedabad | `/`, `/treatments/indoor-physiotherapy` ("Residential Pet Physiotherapy in Shilaj"), `/treatments/home-care` ("Dog Physiotherapy at Home") | `/` | Distinct modifiers already (residential, at home). Keep. Both link back to `/` with the anchor "dog physiotherapy in Ahmedabad". |
| dog swimming pool / hydrotherapy | `/treatments/hydrotherapy`, the bookable "Swimming" card (code `Hydrotherapy`), `/conditions/obesity-rehab` | `/treatments/hydrotherapy` | **One page for both.** Same pool, same booking code; a separate swimming page would split signals and be near-duplicate. Add a "Swimming sessions and prices" H2 instead. |
| pet boarding shilaj | **New** `/services/pet-boarding` vs `/treatments/indoor-physiotherapy` (residential physio for out-of-town patients) | New boarding page | Must be clearly distinct. Boarding = any pet staying (holiday, day care, 24x7). Indoor physiotherapy = a rehab *course* with an overnight stay. Indoor-physio keeps "residential physiotherapy"; boarding never uses "physiotherapy" in its title/H1. Each page links to the other once with a one-line explanation of the difference. |
| dog grooming shilaj | **New** `/services/dog-grooming` vs hydrotherapy (the "swim + groom" combo) | Grooming page | Combo price on the grooming page; hydrotherapy links to it. |
| home visit vet ahmedabad | `/treatments/home-care`, `/` | home-care | Homepage mentions home visits but links out. |
| pet vet ahmedabad | `/` only (Map Pack is the real arena) | `/` (secondary) + GBP | Do not create a "pet-vet-ahmedabad" page. |

---

## 6. On-site changes, ranked by impact

Priority key: P0 = blocks ranking/indexing of a service, P1 = high impact, P2 = quick win, P3 = later. Every item can be built from `clinicData.ts`, `bookableServices.ts` and `siteConfig.ts`. The route registry generates the sitemap, llms.txt, schema and prerender automatically.

### P0-1. Make boarding, swimming, grooming and walking crawlable

**Issue:** `BookableServices` renders nothing in the prerender because `publicServiceCodes` comes from the API at runtime. The clinic's #1 promoted service (the Indoor Facility) does not exist for Google.

**Fix:** in the prerender/SSR path, render the static `BOOKABLE_SERVICES` titles, summaries and inclusions (content only). Keep the API check only for enabling the **Book** buttons. If a service is retired, the clinic removes it from `bookableServices.ts` too. Each tile gets a plain crawlable `<a href>`: Indoor Facility → `/services/pet-boarding` (P0-2), Grooming → `/services/dog-grooming` (P1-5), Swimming → `/treatments/hydrotherapy` (P1-3), Physiotherapy → `/#services`, Walking → `/services/pet-boarding#dog-walking`.

Verify afterwards: `curl -s https://www.thepetphysiovet.com/ | grep -c "Indoor Facility"` > 0.

### P0-2. New page `/services/pet-boarding` (Indoor Facility)

Add a `CARE_SERVICES` (or `kind: 'care'`) entry so `routes.ts` emits `/services/<id>` with its own metadata, schema, sitemap and llms.txt lines. Use a new segment `services`, not `treatments`, because these are not therapies.

- **Title (44):** `Pet Boarding & Day Care in Shilaj, Ahmedabad` (hand-written, no suffix)
- **H1:** `Pet boarding and day care in Shilaj, Ahmedabad, inside a vet physio clinic`
- **Meta (145):** `Indoor pet boarding and day care in Shilaj, Ahmedabad: six beds, 24x7 supervised care, walks and feeding your way, at a vet physiotherapy clinic.`
- **Opening paragraph (primary term in the first 100 words):** "Our indoor pet boarding in Shilaj, Ahmedabad, looks after your dog by the hour, day, week or month, round the clock, in a six-bed indoor facility at The Pet Physio Vet on Thaltej–Shilaj Road."
- **H2s:** What's included (supervised 24x7, six beds, walks and feeding to your preference, food: who brings it); Day care by the hour; Longer stays (week/month); Senior, post-surgery and special-needs pets (physio and pool on site, *only as an add-on the owner confirms*); What to bring and check-in (Aadhaar required, vaccination record *if required: owner confirm*); Prices (render the duration menu **only if** it can be prerendered from a static source; otherwise say "see live prices in the booking panel"); Dog walking (the three walking inclusions); How boarding differs from residential physiotherapy (link to `/treatments/indoor-physiotherapy`); Location and directions from Thaltej, Bopal, SG Highway (landmark: Dine in the Clouds, Shilaj Circle).
- **FAQ (visible + FAQPage):** Is boarding open 24x7? Do you take cats? Can my dog swim during the stay? Is a vet on site? (answer honestly: physiotherapy hours 9:30 to 1:30 Mon to Sat; overnight supervision by staff, *owner confirm*.) Do I need Aadhaar?
- **Schema:** `Service` with `serviceType: "Pet boarding"`, `provider` → business, `areaServed` → Ahmedabad, `hoursAvailable` 24x7 (**only if the owner confirms**), and `offers` priced only where the price is visible on the page.
- **Images:** real boarding-room photos with alt such as "Indoor boarding bed at The Pet Physio Vet, Shilaj". Request photos from the owner; no stock.

### P1-3. Retitle and extend `/treatments/hydrotherapy` to own "swimming pool"

- **Title (45):** `Dog Hydrotherapy & Swimming Pool in Ahmedabad`
- **H1:** `Dog hydrotherapy and swimming in our indoor pool in Ahmedabad` (61, H1 length is fine)
- **Meta (149):** `Dog hydrotherapy and swimming in our indoor, lukewarm pool in Shilaj, Ahmedabad, with a hydrotherapist in the water. Single swim ₹1,300. Book a slot.`
- **New H2 "Swimming sessions and prices"**: single session (swim and dry) ₹1,300; 5 sessions ₹1,100 per session; 8 sessions ₹900 per session (from `bookableServices.ts`, already shown on site). Explain the difference: rehab hydrotherapy is planned by the vet after an assessment; fitness/fun swimming suits healthy dogs. Link to grooming for "swim + groom ₹2,500".
- Schema: add an `Offer` list (`priceCurrency: INR`) to the hydrotherapy Service, mirroring the visible prices.
- Update `servicesForCondition` copy is unaffected.

### P1-4. Add confirmed home-visit areas to `/treatments/home-care` and `siteConfig.areaServed`

- Replace the generic H2 with **"Areas we visit for home physiotherapy"**, then a plain list of the **owner-confirmed** localities (likely candidates: Shilaj, Thaltej, Ambli, Bopal, South Bopal, Bodakdev, Sindhu Bhavan Road, Science City, Sola; others only if true), plus one honest line: "Further away? Call us; we will tell you whether we can visit or suggest clinic sessions."
- Add visit days/times and any visit charge **only if the owner provides them**.
- **Meta (151):** `Dog and cat physiotherapy at home across Ahmedabad (Shilaj, Thaltej, Bopal and nearby): home visits by Dr. Dhanvi Patel plus a home exercise programme.` (Use only if Bopal is confirmed.)
- `siteConfig.areaServed` = the same confirmed list. On the home-care Service, add `areaServed` as a `GeoCircle` (`geoMidpoint` = the clinic pin from the GBP, `geoRadius` = the owner's real radius in metres, e.g. 8000) **in addition to** the named areas.
- **Doorway-risk flag:** do **not** create `/areas/bopal`, `/areas/thaltej`, `/vet-in-satellite`, or similar. Google's spam policy names "pages targeted at specific regions or cities that funnel users to one page" as doorway abuse ([Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)). One list on the home-care page plus the GBP service areas covers this honestly. A single `/areas/shilaj` page is also unnecessary, because the clinic is *in* Shilaj and the homepage already carries that relevance.

### P1-5. New page `/services/dog-grooming`

- **Title (54):** `Dog Grooming in Shilaj, Ahmedabad | The Pet Physio Vet`
- **H1:** `Dog grooming in Shilaj: bath, clipping, nails and senior-dog care`
- **Meta (147):** `Dog grooming at our Shilaj, Ahmedabad clinic: herbal shampoo bath, hair clipping, nail trimming and gentle care for senior dogs. Shampooing ₹1,200.`
- **Body:** price table (Shampooing ₹1,200; Nail trimming ₹200; Hair clipping ₹800; Swim + groom + shampoo + dry ₹2,500, compared with ₹3,500 separately), herbal care, oiling massage before the bath, geriatric grooming (a real differentiator: handling arthritic and post-surgery dogs gently), drying after swimming. FAQ: Do you groom cats? (owner confirm). How long does it take? (owner confirm).
- Lower priority than boarding: grooming is competitive and less tied to the clinic's expertise. Build it only if the owner wants grooming customers (the bookable card suggests yes).

### P1-6. Homepage local relevance (no title change)

Cannibalisation-safe: the title stays. It already owns "dog physiotherapy ahmedabad".

- **Meta (152):** `Vet physiotherapy for dogs and cats in Shilaj, Ahmedabad: indoor hydrotherapy pool, laser, acupuncture, home visits and boarding, with Dr. Dhanvi Patel.` Change `SITE.metaDescription`; the text has no "&", per the existing note.
- **Hero sub-line (visible):** "A veterinary physiotherapy clinic in Shilaj, Ahmedabad, run by Dr. Dhanvi Patel (M.V.Sc.), with home visits across nearby areas."
- **New short H2 block "Find us in Shilaj"** (above the footer, 60 to 100 words): the landmark (near Dine in the Clouds, Shilaj Circle, Thaltej–Shilaj Road), "about X minutes from Thaltej cross roads / Bopal / SG Highway" (owner verifies the times), a parking note if true, the Get directions link (Maps CID), and physio hours plus boarding hours.
- Secondary services row (from P0-1) linking to boarding, grooming and hydrotherapy, with descriptive anchors ("pet boarding in Shilaj", "dog grooming", "dog swimming pool").
- Footer "Information" links: add "Pet boarding" and "Dog grooming".

### P1-7. Expand `/conditions/neurological-recovery` (thinnest money page, 592 words)

- **Meta (153):** `Dog paralysis and hind-leg weakness rehab in Ahmedabad: IVDD, spinal stroke (FCE), myelopathy and nerve injury. Physio, laser, hydrotherapy, home visits.`
- Keep the title and H1 (cannibalisation-safe: IVDD keeps "slipped disc").
- Add H2s: "My dog's back legs stopped working: what to do today" (see your vet or an emergency hospital first; physio follows a diagnosis); "What rehab looks like week by week" (general, no cure claims); "Home visits for dogs that cannot travel" (link to home-care); "Wheelchairs, slings and bladder care at home" (only what the clinic advises). Target 1,000+ words, reviewed by Dr. Patel and dated (already `CONTENT_REVIEWED_DATE`).
- One natural Hinglish/Gujarati FAQ line, if confirmed.

### P1-8. Reconcile hours everywhere (NAP+H consistency)

Owner states the true hours for: physiotherapy appointments, boarding check-in/out, and grooming/swimming slots. Then:
- `siteConfig.openingHours` = the clinic's front-desk/public hours (what GBP shows).
- Service-level `hoursAvailable`: physio 09:30 to 13:30 Mon to Sat; boarding 00:00 to 23:59 daily if truly 24x7.
- GBP main hours = the same as the site; GBP "More hours" for boarding.
- Footer shows both lines.

### P1-9. FAQ additions (homepage FAQ + FAQPage; Google shows no FAQ rich results for clinics, so this is for users and AI answers)

Answer only with confirmed facts; `[owner]` = needs confirmation.

1. **Are you a regular vet? Do you do vaccinations and check-ups?** [owner: yes/no. This decides the "pet vet" strategy.]
2. **Do I need a referral?** Rewrite the current answer so it does not deter direct bookings, e.g. "No referral is needed to book an assessment. If your pet has X-rays or surgery reports, bring them." [owner]
3. **Which areas do you cover for home visits?** [owner list]
4. **Where exactly is the clinic?** Landmark answer (Dine in the Clouds, Shilaj Circle).
5. **How much does dog swimming cost?** ₹1,300 single; ₹1,100 per session for 5; ₹900 per session for 8.
6. **Do you offer pet boarding?** Yes: indoor, 24x7 supervised, 6 beds, by hour/day/week/month, Aadhaar at check-in.
7. **What does grooming cost?** Prices as above.
8. **What are your hours?** Physio Mon to Sat 9:30 AM to 1:30 PM by appointment; boarding [owner].
9. **Do you treat cats and other pets?** Bio states avian and exotic experience [owner: say what is actually accepted].
10. **Which languages do you speak?** English, Gujarati, Hindi [owner].

### P2-10. Schema updates (keep honest, mirror visible content)

- Business node: `areaServed` = confirmed list (AdministrativeArea for localities, `City` for Ahmedabad); `geo` = the **exact GBP pin** (current coordinates are road-level, per the `siteConfig.ts` note); add `sameAs` for the Justdial listing (the repo notes 5.0/23 there; owner to supply the URL), Facebook and YouTube if they exist; `availableLanguage` on ContactPoint = confirmed languages; `knowsLanguage` on the Person.
- New `Service` nodes: Pet boarding, Dog grooming, Dog walking, Swimming (or Offers on hydrotherapy), each with `provider`, `areaServed`, `offers` (INR) only where the price is visible.
- Keep **no** AggregateRating/Review (self-serving), as the code already does.
- `BreadcrumbList` for `/services/*`: Home › Services › Pet boarding.
- Validate in the [Rich Results Test](https://search.google.com/test/rich-results) and the [Schema Markup Validator](https://validator.schema.org/) after deploy.

### P2-11. llms.txt

Add a "Care services" section (boarding, day care, swimming, grooming, walking, each with a one-line description and the stated prices), the confirmed home-visit areas, the hours split by service, and a scope line ("physiotherapy and rehabilitation practice; not a 24-hour emergency hospital; general consultations: [owner]"). This is generated by `scripts/prerender.mjs` from the same data, so it follows P0-2 automatically if the generator is extended.

### P2-12. Technical quick wins

- **Redirect chain:** make `http://thepetphysiovet.com/*` 301/308 straight to `https://www.thepetphysiovet.com/*` (Cloudflare redirect rule or Vercel domain config). Currently 2 hops.
- **Cloudflare email obfuscation:** turn off "Email Address Obfuscation" for this zone, or accept it (low impact). The JSON-LD email should be checked after deploy so it is not rewritten.
- **CWV (mobile LCP 6.2 s, CLS 0.18 in lab):**
  1. The intro overlay (`#intro .intro-mark img.intro-l`) is the LCP element. Skip the intro for crawlers and first visits, or shorten it to under ~500 ms, and make the hero poster the LCP element with `fetchpriority="high"`.
  2. Lazy-load the 4 reel MP4s (`preload="none"`, start only when in the viewport, poster image first). That is about 3.7 MB off initial load.
  3. Serve `hero-loop.mp4` (1.7 MB) only on wide screens or after load; use the poster on mobile.
  4. Reserve the hero container height (CLS culprit `section#home > div.relative`).
  5. Re-measure with PageSpeed Insights (the API quota was exhausted today) and, once traffic exists, with CrUX field data in Search Console.
- **Logo SVG 122 KB:** simplify/optimise, or use the 4.5 KB `logo-96.webp` in the intro.

### P3-13. Content assets that earn local links (month 2+)

- "Ahmedabad dog breeds and their joint risks", using AMC's 2026 registration data (Labradors, GSDs, Golden Retrievers are the top breeds) with prevention tips by Dr. Patel. Citable by local media and RWAs.
- "Hydrotherapy explained" short video on YouTube, embedded on the hydrotherapy page (`VideoObject` schema).
- Recovery case studies with written owner consent (named condition and locality, e.g. "IVDD Dachshund from Bopal walks again"). These give relevance without doorway pages.

---

## 7. Off-site plan (biggest lever for the Map Pack)

Google ranks local results on **relevance, distance and prominence**: "More reviews and positive ratings can help your business's local ranking" ([Google, local ranking](https://support.google.com/business/answer/7091)). Distance is fixed, so the levers are relevance (categories, services, description, website content) and prominence (reviews, links, citations, mentions). Use `offsite-checklist.md` as the step-by-step. Items below are additions or decisions specific to this plan.

### 7.1 Google Business Profile

| # | Action | Detail |
|---|---|---|
| G1 | **Primary category decision** (owner) | If Dr. Patel sees general cases (consultations, vaccinations): primary **Veterinarian**. This is the only realistic way into "pet vet ahmedabad" / "vet near me" Map Packs, and it is honest because she is a B.V.Sc. & A.H. If she does rehab only: primary = the animal physiotherapy/rehabilitation category **if the dashboard offers one** (wording unverified, see the 2026-10-07 checklist), and accept that generic "vet near me" will mostly go to general clinics. Google: "use as few categories as possible to describe your overall core business" ([GBP guidelines](https://support.google.com/business/answer/3038177)). |
| G2 | Secondary categories | Pet boarding service; Pet groomer; Dog day care center (if day care is sold); Dog walker (only if walks are sold to non-boarders). Add an animal physiotherapy category if it exists and was not used as primary. |
| G3 | Business name | Exactly `The Pet Physio Vet`. No "Best", "Ahmedabad", "Physiotherapy & Boarding" additions (suspension risk). |
| G4 | Hybrid service area | Keep the storefront address visible, and add up to 20 service areas (≤ about 2 h drive) = the **confirmed home-visit list** ([Google, service areas](https://support.google.com/business/answer/9157481)). |
| G5 | Hours | Fix to the reconciled hours (P1-8). Add "More hours" for boarding if 24x7. Wrong hours are a top cause of bad reviews. |
| G6 | Services (with descriptions and prices where stated) | Veterinary physiotherapy; Hydrotherapy; Dog swimming (₹1,300 / ₹1,100 / ₹900); Acupuncture (CVA); Class IV laser & electrotherapy; Home visits; Pet boarding & day care; Grooming (₹1,200 / ₹200 / ₹800 / ₹2,500 combo); Dog walking; IVDD/paralysis rehab; Post-surgery rehab; Arthritis care. |
| G7 | Products (optional) | Swim packs (5 and 8 sessions), "Swim + groom" combo, at the site's stated prices. Products show visually on the profile. |
| G8 | Description (582 chars, fits 750) | "The Pet Physio Vet is a veterinary physiotherapy and rehabilitation clinic in Shilaj, Ahmedabad, run by Dr. Dhanvi Patel (B.V.Sc. & A.H., M.V.Sc., certified veterinary physiotherapist and CVA acupuncturist). We help dogs and cats recover from IVDD, paralysis, arthritis, hip dysplasia, surgery and injury with physiotherapy, an indoor lukewarm hydrotherapy pool, Class IV laser, acupuncture and electrotherapy, plus home visits across nearby Ahmedabad areas. We also offer indoor boarding and day care, supervised swimming, grooming and dog walking. Physiotherapy is by appointment." [owner: verify every claim] |
| G9 | Photos | 15+ real photos in the first 2 weeks: exterior and signage with the landmark, the pool, boarding beds, grooming area, Dr. Patel, sessions (with consent). Then 2 to 4 per month. Add short videos (the reels already exist). |
| G10 | **Posts, weekly** | Strong evidence they get indexed: in this research, a competitor's GBP posts (`business.google.com/v/...`) filled 10 of 10 web results for "pet vet ahmedabad" [1]. Rotate: a recovery story, a swimming offer/slot, a boarding availability note, a "signs your senior dog needs physio" tip, a home-visit area spotlight. Each post gets a photo and a "Book" or "Call" button with UTM-tagged links. |
| G11 | Q&A | If the profile still shows Q&A, seed it with the P1-9 FAQs (answered from the owner account). If not, put the same facts in Services and the description. |
| G12 | Website + appointment links with UTMs | `?utm_source=google&utm_medium=organic&utm_campaign=gbp_website` / `gbp_booking` (robots.txt already blocks `utm_` URLs from crawl, which is fine). |
| G13 | Booking button | Point it at the site booking; or use "Reserve with Google" only if a supported partner exists (none confirmed). |

### 7.2 Reviews (prominence; compliant)

- Current: 5.0 from 24 Google reviews (site note dated 2026-10-07). Nearby comparison: Dr. C.M.'s Pet Clinic 4.9 from 135 [12][14]; Simba's Pride 4.8 from 64 on Yappe [13].
- **Target: +6 to 8 genuine reviews per month (about 70+ by month 6).** This is a plan target, not a forecast.
- Ask every client at a natural high point (after the session where the pet walks better, at boarding pickup, after grooming). Use the WhatsApp scripts in `offsite-checklist.md` §3, a reception QR code, and a line on the boarding pickup receipt.
- Clients write in their own words; it helps if they *naturally* mention the service and their area. **Never script keywords, never offer discounts or freebies, never gate** (ask everyone). Reply to every review within 48 h; mention the service naturally in the reply.
- Boarding and grooming customers are a new review source. Their reviews add "boarding/grooming" relevance to the profile.

### 7.3 Citations: exact NAP to use everywhere

```
The Pet Physio Vet
Shop No. 1 & 2, Ground Floor, Avaneesh Heights, Thaltej – Shilaj Road,
near Dine in the Clouds restaurant, Shilaj Circle, Shilaj, Ahmedabad, Gujarat 380059
+91 72840 73241
https://www.thepetphysiovet.com
```
Where the address field is short, use: `Shop No. 1 & 2, Avaneesh Heights, Thaltej – Shilaj Road, Shilaj Circle, Shilaj, Ahmedabad, Gujarat 380059`. The spelling "Avaneesh" matches the GBP.

| # | Platform | Status / why | Category to pick |
|---|---|---|---|
| C1 | Google Business Profile | Exists (CID 16829298020285027612) | see G1/G2 |
| C2 | **Justdial** | A listing appears to exist (5.0/23 per the repo note). **Owner: send the URL.** Fix NAP and categories; add boarding/grooming categories; add photos. Our fetch of Justdial category pages was blocked (403), so its rank there is unverified. | Veterinary doctors; Pet boarding; Pet grooming |
| C3 | Bing Places | Import from GBP. Feeds Bing and Copilot. | Veterinarian / Pet services |
| C4 | Apple Business Connect | Available globally per Apple ([Wordtracker summary](https://wordtracker.com/blog/marketing/apple-maps-launches-apple-business-connect)). Claim the Apple Maps place card. | Veterinarian |
| C5 | Sulekha | Lead marketplace; free listing. | Veterinary clinics / Pet boarding |
| C6 | **Drlogy** | Lists Ahmedabad vets (Dr. Chirag Dave's clinic and doctors rank there) [5][14]. Add the clinic and a doctor profile for Dr. Patel. | Veterinarian |
| C7 | **DocIndia** | Lists Ahmedabad veterinarians ([example](https://www.docindia.org/doctors/ahmedabad/dr-hiren-thakkar-veterinary)). Add a doctor profile. | Veterinary |
| C8 | **Yappe.in** | Pet-service directory; Simba's Pride boarding ranks via it [13]. List boarding and the clinic. | Dog boarding / Vet |
| C9 | Facebook Page + Instagram | Instagram exists. Create or complete Facebook with identical NAP; add both to `sameAs`. | Veterinarian |
| C10 | WhatsApp Business | Catalogue with services and prices; same NAP and hours. | — |
| C11 | WhatClinic | Lists Ahmedabad physiotherapy (human) ([link](https://www.whatclinic.com/physiotherapy/india/ahmedabad)); check for a vet category before listing. | — |
| C12 | IndiaMART | **Skip** (B2B products). | — |
| C13 | Practo | **Skip.** Human-health platform; no vet listings found. | — |

Run a quarterly check by searching `"72840 73241"` to find duplicate or inconsistent listings.

### 7.4 Local links and mentions (earned, no paid links; any sponsorship link must be `rel="sponsored"`)

| Target | Angle | Evidence it exists |
|---|---|---|
| General vets in Thaltej, Bopal, Bodakdev, Satellite (e.g. orthopaedic/neuro surgeons) | Referral partnership for post-op and IVDD rehab: a one-page referral sheet; ask for a "partners / rehab referrals" mention. The cleanest long-term source of both links and patients. Do not reciprocally swap sitewide links. | Dr. Chirag Dave's Pets Clinic, Sneh Pet Clinic, Dr. C.M.'s [5] |
| **POSH Foundation** (Ahmedabad) | It planned its own physio unit for paralysed strays; offer pro-bono assessments or training. Natural coverage and link. | [Better India](https://thebetterindia.com/97275/posh-foundation-aaditi-badam-animal-physiotherapy) |
| **Jivdaya Charitable Trust** (Ahmedabad) | Runs a rehab centre and hospital for strays; offer rehab support for spinal cases. | [Better India](https://thebetterindia.com/100372/jivdaya-ahmedabad-animal-welfare) |
| PFA Ahmedabad / other rescues | Free mobility assessment days for adopted disabled dogs. | keyword map §2 |
| **Ahmedabad Kennel Club / INKC shows** | Exhibit or sponsor; offer gait/fitness checks at the show; get an event-page listing. The last all-breed show was 11 Jan 2026; watch for the 2027 date. | [INKC event](https://inkc.in/events/260-261-championship-dog-show-all-breeds), [INKC obedience Ahmedabad](https://inkc.in/events/inkc-obedience-show-ahmedabad) |
| **Heads Up For Tails "Dogathon Ahmedabad"** | Stall or "fitness check" partner. | [HUFT events](https://events.headsupfortails.com/products/dogathon-ahmedabad) |
| Kamdhenu University, COVS Anand (and Dr. Patel's own alma mater) | Alumni feature, guest lecture on veterinary physiotherapy (a rare speciality in Gujarat). | [COVS Anand](https://kamdhenuuni.edu.in/covs-anand-about-us) |
| Local media: Ahmedabad Mirror, TOI Ahmedabad Times, DeshGujarat, Divya Bhaskar, Gujarat Samachar, plus city Instagram creators | Story: an indoor lukewarm hydrotherapy pool for dogs in Ahmedabad, plus a recovery story. Do not claim "first/only" unless proven. A pet-registration data story shows local press covers pets. | [Telangana Today/AMC data](https://telanganatoday.com/ahmedabad-registers-nearly-20000-pet-dogs-labradors-remain-the-citys-most-popular-breed) |
| Homegrown "dog pools in India" list | Pitch an inclusion (the list exists and ranks for swimming queries). | [Homegrown](https://homegrown.co.in/homegrown-explore/lifestyle/take-a-dip-with-your-pets-at-these-7-pools-around-india) |
| RWAs and society groups in Shilaj, Thaltej, Bopal | A talk on senior-dog care; a notice-board flyer with a QR code. Mentions, not necessarily links. | — |

Disavow: not needed. Use only for a manual action or a clear spam attack.

### 7.5 Search Console and Bing Webmaster (day 1)

1. Search Console → add a **Domain property** `thepetphysiovet.com` → verify with a DNS TXT record at the DNS host (Cloudflare, per response headers). Keep the record permanently.
2. Optional: also put the HTML-tag token in `siteConfig.verification.google` (the generator emits the meta tag).
3. Submit `https://www.thepetphysiovet.com/sitemap.xml`. URL Inspection → Request indexing for `/`, `/treatments/hydrotherapy`, `/treatments/home-care`, `/conditions/neurological-recovery`, `/conditions/ivdd`, and the new `/services/pet-boarding` once live.
4. Pages report: record a baseline (indexed vs not indexed) on the day of verification.
5. Bing Webmaster Tools → **Import from Search Console** → submit the sitemap. Optionally enable IndexNow (Cloudflare has a toggle for it: "Crawler Hints").
6. Link Search Console with GA4 if GA4 is in use. Set up an annotations log (below).

---

## 8. Realistic expectations for a 2-week-old domain

| Query type | What is realistic | When (estimate) |
|---|---|---|
| Brand ("the pet physio vet", "dhanvi patel vet") | Rank #1 organically plus the knowledge panel from GBP | 1 to 4 weeks after indexing |
| Niche + city ("dog hydrotherapy ahmedabad", "dog physiotherapy ahmedabad", "dog paralysis treatment ahmedabad") | Top 3 to 5 organic is plausible; little local competition was seen | 1 to 4 months |
| Niche Map Pack near Shilaj ("dog physiotherapy near me", "hydrotherapy for dogs") | Likely in the Map Pack for searchers within a few km, sooner than organic, because the GBP already exists with reviews | 2 to 8 weeks after GBP optimisation |
| "pet boarding shilaj", "dog grooming thaltej" | Map Pack for nearby searchers is possible with the right categories, reviews and photos; organic citywide is competitive (dedicated boarding brands) | 2 to 6 months |
| "pet vet ahmedabad", "vet near me" | **Map Pack only for searchers close to Shilaj, and only with the Veterinarian category plus strong review growth.** A citywide #1 for "pet vet ahmedabad" against general clinics with 100+ reviews is **not realistic in 6 months** and is never guaranteed. | 3 to 9+ months for the near-Shilaj Map Pack |

---

## 9. 30 / 60 / 90-day timeline

**Days 1 to 30**
- Owner: answer the confirmation list (§11). Claim the Justdial URL. Verify Search Console and Bing (§7.5). GBP: G1 to G9 and G12; first 2 posts; 15 photos.
- Dev: P0-1 (crawlable services), P0-2 (boarding page), P1-3 (hydrotherapy retitle + prices), P1-6 (homepage meta + "Find us" block), P1-8 (hours), P2-12 redirect fix + CWV items 1 to 4. Deploy, then request indexing.
- Baselines: Search Console Pages and Performance (0 expected); GBP Performance; review count; a manual rank check (incognito, location Shilaj) for the top 10 keywords; the AI-assistant baseline from `offsite-checklist.md` §6.

**Days 31 to 60**
- Dev: P1-4 (home-visit areas + GeoCircle), P1-5 (grooming page), P1-7 (neuro expansion), P1-9 (FAQs), P2-10 (schema), P2-11 (llms.txt).
- Off-site: citations C3 to C11; weekly GBP posts; review asks running (target +6 to 8/month); outreach to 10 referring vets, POSH, Jivdaya.
- Review Search Console: queries with impressions in positions 4 to 20 ("striking distance") → tune those pages.

**Days 61 to 90**
- Press pitch (pool story + a recovery case); event participation (HUFT Dogathon / AKC show if dated).
- P3-13 content asset (Ahmedabad breeds and joints); YouTube hydrotherapy video.
- Decide on Gujarati pages using Search Console query data (§3.5).
- Compare like for like: 28 days vs the previous 28 days; brand vs non-brand separated.

---

## 10. KPIs to track (monthly; annotate every change date)

| KPI | Source | Note |
|---|---|---|
| Indexed pages / total sitemap URLs | Search Console → Pages | Target: all canonical URLs indexed by day 60 |
| Non-brand impressions and clicks | Search Console → Performance (filter out queries containing "physio vet", "dhanvi") | The main SEO signal |
| Average position for the top 10 keywords | Search Console (query filter) | Ignore positions with under ~20 impressions |
| GBP: calls, direction requests, website clicks, bookings | GBP Performance | Plus "Searches" (the terms people used) |
| GBP search-term share: "vet", "boarding", "grooming", "physio" | GBP Performance → searches | Shows whether category changes worked |
| Review count, average, monthly velocity | GBP | Target +6 to 8/month |
| Map Pack visibility near Shilaj, Thaltej, Bopal | Manual incognito checks with location set, same queries monthly (or a grid tool if one is bought) | Label as manual |
| Bookings by source | `utm_*` on GBP links + site booking analytics | Physio vs boarding vs grooming split |
| CWV p75 (LCP, INP, CLS) | Search Console CWV report / PSI once CrUX has data | Lab target now: LCP < 2.5 s, CLS < 0.1 |
| Citations live and NAP-consistent | Tracker in `offsite-checklist.md` §4 | |
| Referring domains | Search Console → Links | Quality over count |

Annotation log:

| Date | Change | Pages affected |
|---|---|---|
| 2026-10-08 | Plan written; baseline Lighthouse mobile: Perf 56, LCP 6.2 s, CLS 0.184 | — |

---

## 11. Owner must confirm before implementation

1. **General vet services?** Does Dr. Patel do consultations, vaccinations and sick visits for any pet, or rehab only? This decides the GBP primary category and the "pet vet ahmedabad" strategy (G1, FAQ 1). Should the referral FAQ be softened?
2. **Home-visit coverage:** the exact list of localities (and the max distance/radius), the visit days/times, and whether there is a home-visit fee. Is Gota really covered? Are Bopal, South Bopal and Ambli covered?
3. **Hours:** physio hours (Mon to Sat 9:30 to 1:30?), Sunday, boarding (truly 24x7?), and grooming/swimming slots. What does the GBP show today (the 2026-10-07 audit saw "closes 7:30 pm")?
4. **Boarding:** dogs only, or cats too? Vaccination proof needed? Who is on site overnight? Can boarding prices be published as static text?
5. **Grooming and walking:** sold to anyone, or only to boarding/swim clients? Cats groomed?
6. **Prices:** are the swimming (₹1,300/1,100/900) and grooming (₹1,200/200/800/2,500) prices current and OK to show on GBP and directories? Any physio/assessment price to publish? (Not stated today; none will be invented.)
7. **Listings:** the Justdial URL; whether a Facebook page exists; Sulekha or other existing listings.
8. **Languages spoken** (Gujarati/Hindi) and a Gujarati speaker to check any Gujarati lines.
9. **Exact GBP pin** coordinates (to replace the road-level `geo`).
10. **Photos:** boarding room, grooming area, exterior with signage.
11. Dr. Patel's alma mater and Veterinary Council registration (for E-E-A-T and the alumni outreach).

---

## Sources (search observations, 2026-10-08; indicative, not Google rank data)

1. "pet vet ahmedabad": [Dr. C.M.'s GBP post](https://business.google.com/v/dr-c-m-s-pet-clinic/08525163697167224886/e4d8/_/lp/8094345043747450863/), [another post](https://business.google.com/v/dr-c-m-s-pet-clinic/08525163697167224886/e4d8/_/lp/2385594378721063950/)
2. "dog physiotherapy ahmedabad": [Better India, POSH](https://thebetterindia.com/97275/posh-foundation-aaditi-badam-animal-physiotherapy), [Vetic Gurgaon](https://vetic.in/pet-physiotherapy-gurgaon), [Bajaj Finserv Health (human physio)](https://www.bajajfinservhealth.in/hospitals/ahmedabad/physiotherapy-hospitals-21?page=2)
3. "dog hydrotherapy swimming pool ahmedabad": [Wikipedia](https://en.wikipedia.org/wiki/Canine_hydrotherapy), [AKC](https://www.akc.org/expert-advice/health/hydrotherapy-for-dogs-growing-trend-in-canine-physical-therapy), [RVC](https://www.rvc.ac.uk/small-animal-vet/specialist-referrals/facilities/hydrotherapy-pool)
4. "pet boarding shilaj ahmedabad": [Doggy Hotel](https://doggyhotel.in/), [Homegrown boarding list](https://homegrown.co.in/homegrown-explore/list-of-pet-boardings-across-india-for-covid-19-affected-families)
5. "veterinary clinic near shilaj thaltej": [Drlogy, Dr. Chirag Dave's Pets Clinic](https://www.drlogy.com/ahmedabad/clinic/dr.-chirag-dave-s-pets-clinic), [DocIndia](https://www.docindia.org/doctors/ahmedabad/dr-hiren-thakkar-veterinary)
6. "veterinary physiotherapy rehabilitation centre ahmedabad paralysis": [The Quint](https://www.thequint.com/news/physiotherapist-quits-job-helps-differently-abled-animals), [Better India](https://thebetterindia.com/97275/posh-foundation-aaditi-badam-animal-physiotherapy)
7. "dog grooming thaltej bodakdev shilaj": only Dr. C.M.'s GBP and irrelevant directories
8. "The Pet Physio Vet" Ahmedabad: no result for the clinic; [WhatClinic](https://www.whatclinic.com/physiotherapy/india/ahmedabad)
9. Paralysis: as in 6
10. "dog swimming pool ahmedabad": [Doggy Hotel](https://www.doggyhotel.in), [Homegrown pools list](https://homegrown.co.in/homegrown-explore/lifestyle/take-a-dip-with-your-pets-at-these-7-pools-around-india)
11. Locality distances: [Mapcarta](https://mapcarta.com/14903324), [Adani Realty posh areas](https://adanirealty.com/blogs/posh-areas-in-ahmedabad)
12. "vet home visit ahmedabad": [Dr. C.M.'s post](https://business.google.com/v/dr-c-m-s-pet-clinic/08525163697167224886/e4d8/_/lp/431134785262605998/)
13. "dog daycare ahmedabad sg highway bodakdev": [Yappe, Simba's Pride](https://yappe.in/gujarat/ahmedabad/simbas-pride-dog-boarding/632158)
14. "pet clinic bopal": Dr. C.M.'s GBP (4.9, 135 reviews per result snippet); [Drlogy, Dr. Chirag Dave](https://www.drlogy.com/ahmedabad/doctor/dr-chirag-dave)
15. Hinglish/Gujarati romanised query: no relevant local result
16. Google policy: [Local ranking](https://support.google.com/business/answer/7091), [GBP guidelines](https://support.google.com/business/answer/3038177), [Service areas](https://support.google.com/business/answer/9157481), [Spam policies, doorway abuse](https://developers.google.com/search/docs/essentials/spam-policies)
17. Local data and events: [AMC pet registration (Telangana Today)](https://telanganatoday.com/ahmedabad-registers-nearly-20000-pet-dogs-labradors-remain-the-citys-most-popular-breed), [INKC Ahmedabad show](https://inkc.in/events/260-261-championship-dog-show-all-breeds), [HUFT Dogathon Ahmedabad](https://events.headsupfortails.com/products/dogathon-ahmedabad), [Jivdaya](https://thebetterindia.com/100372/jivdaya-ahmedabad-animal-welfare), [COVS Anand](https://kamdhenuuni.edu.in/covs-anand-about-us)

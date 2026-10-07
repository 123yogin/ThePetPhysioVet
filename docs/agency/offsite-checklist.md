# Off-site presence checklist: The Pet Physio Vet

Prepared 2026-10-07. Owner-actionable; no code needed. Items are ordered by likely impact on local searches such as "pet vet Ahmedabad", "dog physiotherapy Ahmedabad" and "pet hydrotherapy Ahmedabad".

Why this matters: "pet vet ahmedabad" is a local query. Google answers it mainly from the map pack (Google Business Profile), and the website often does not rank at all for a short generic query. Being absent from organic results is usually fixed by (1) getting the site indexed and (2) building the Business Profile, reviews and citations below. None of this guarantees ranking; it raises the likelihood.

## Canonical business details (copy these exactly everywhere)

| Field | Value |
|---|---|
| Name | The Pet Physio Vet |
| Address | Shop No. 1 & 2, Ground Floor, Avaneesh Heights, Thaltej – Shilaj Road, near Dine in the Clouds restaurant, Shilaj Circle, Shilaj, Ahmedabad, Gujarat 380059 |
| Phone | +91 72840 73241 |
| Email | contact@thepetphysiovet.com |
| Website | https://www.thepetphysiovet.com |
| Clinician | Dr. Dhanvi Patel (B.V.Sc. & A.H., M.V.Sc.) |
| Instagram | https://www.instagram.com/thepetphysiovet/ |
| Google Maps CID | 16829298020285027612 |
| Hours | [owner: confirm hours] |
| Booking / appointment URL | [owner: confirm booking URL; use the site's booking page if one exists] |
| Facebook page URL | [owner: confirm whether one exists] |

Rule: pick one spelling ("Thaltej – Shilaj Road", "Shilaj Circle", pincode 380059) and never vary it. Decide once whether the phone is written `+91 72840 73241` and use that format on every listing.

---

## 1. Google Search Console and Bing Webmaster Tools (do first; about 1 hour)

If the site is not indexed, nothing else helps the website itself.

- [ ] 1.1 Sign in to Google Search Console (search.google.com/search-console) and add a **Domain property** for `thepetphysiovet.com`.
- [ ] 1.2 Verify via **DNS TXT record**: copy the TXT value Google gives, add it at the domain registrar/DNS host as a TXT record on the root (`@`), wait a few minutes, click Verify. Keep the record permanently.
- [ ] 1.3 Sitemaps > submit `https://www.thepetphysiovet.com/sitemap.xml`. Status should read "Success". If it says "Couldn't fetch" or "Has errors", open the sitemap URL in a browser; it must load XML, return HTTP 200 and list the `https://www.` URLs.
- [ ] 1.4 URL Inspection > paste `https://www.thepetphysiovet.com/` > read the verdict > **Request indexing**. Repeat for the main service pages (physiotherapy, hydrotherapy, acupuncture, home visits, contact). Quota is limited; do the most important 5 to 10.
- [ ] 1.5 Open **Pages** (formerly Coverage) report. Note the counts of Indexed vs Not indexed and screenshot them as a baseline.
- [ ] 1.6 Check **Settings > Crawl stats** and **Manual actions** / **Security issues**; all should be empty.
- [ ] 1.7 Confirm only one version is canonical: `http://`, `https://`, with and without `www` should all redirect to `https://www.thepetphysiovet.com`. Test in URL Inspection ("Page indexing > User-declared canonical vs Google-selected canonical").
- [ ] 1.8 Bing Webmaster Tools (bing.com/webmasters): sign in, **Import from Google Search Console** (fastest) or add the site and verify by DNS (CNAME/TXT). Submit the same sitemap URL. Use "URL Submission" for the homepage. Bing data also feeds Bing Places, Copilot and several AI assistants.
- [ ] 1.9 Recheck after 7 days and again after 28 days. Log counts in the table at the end of this section.

**If pages show "Discovered – currently not indexed" or "Crawled – currently not indexed":**

| Status | Meaning | What to do |
|---|---|---|
| Discovered – not indexed | Google knows the URL (from the sitemap) but has not crawled it yet | Usually new-site/low-priority. Add internal links to the page from the homepage and menu; get 1-2 external links (section 5); request indexing; wait 2-4 weeks. Check the server is not slow or erroring. |
| Crawled – not indexed | Google fetched it and chose not to index | Page is thin or near-duplicate. Add unique, useful text (what the treatment is, who it suits, what happens in a session, price/booking info if the clinic is willing), a clear H1, and internal links. Then re-request indexing. |
| Excluded by "noindex" | A noindex tag/header is present | Tell the developer to remove it on public pages. |
| Blocked by robots.txt | robots.txt disallows it | Developer to fix `https://www.thepetphysiovet.com/robots.txt`. |
| Page with redirect / Duplicate, Google chose different canonical | Several URL versions | Fix redirects and canonical tags to the single `https://www.` version. |
| Soft 404 | Page looks empty to Google (often content only appears after JavaScript) | Developer to confirm main text is in the HTML source (View Source, not Inspect). |

Index tracking log:

| Date | Pages indexed | Not indexed | Top reason | Homepage indexed? |
|---|---|---|---|---|
| [date] | | | | |

Quick manual check any time: search Google for `site:thepetphysiovet.com`. No results means not indexed.

---

## 2. Google Business Profile (GBP): biggest lever for "pet vet Ahmedabad"

The clinic already has a Maps listing (CID 16829298020285027612). **Claim/verify the existing listing; do not create a duplicate.**

- [ ] 2.1 Open google.com/business, search "The Pet Physio Vet", choose the existing listing (or use the Maps link `https://maps.google.com/?cid=16829298020285027612`, then "Own this business?"). Complete verification (video/phone/postcard as offered). Allow up to several days.
- [ ] 2.2 Business name: exactly `The Pet Physio Vet`. Do not add keywords ("Best Pet Vet Ahmedabad"); Google suspends profiles for this.
- [ ] 2.3 **Primary category.** Choose what a searcher would call the clinic. See the category table below; owner decides, then confirm in the dashboard's own category search.
- [ ] 2.4 **Secondary categories** (up to 9; add only ones that truly apply and exist in the dropdown).
- [ ] 2.5 Address and service area: enter the NAP exactly as in the table above; pin on the map is on the building (Avaneesh Heights, near Dine in the Clouds restaurant). Because home visits are offered, optionally add service areas (Shilaj, Thaltej, Bopal, Ahmedabad: [owner: confirm areas served]). Keep the street address visible since customers visit the clinic.
- [ ] 2.6 Phone: `+91 72840 73241` as primary. Website: `https://www.thepetphysiovet.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp_website`
- [ ] 2.7 Appointment link: `[owner: confirm booking URL]` with `?utm_source=google&utm_medium=organic&utm_campaign=gbp_appointment`. UTMs let you see GBP clicks separately in analytics.
- [ ] 2.8 Hours: `[owner: confirm hours]` for every day, plus special hours for holidays. Add "More hours" for home visits/boarding if different.
- [ ] 2.9 Services: add each service below with a 1-2 sentence description in plain language. Use only what the clinic really offers.
- [ ] 2.10 Business description (750 characters max). Draft: "The Pet Physio Vet is a veterinary physiotherapy and rehabilitation clinic in Shilaj, Ahmedabad, led by Dr. Dhanvi Patel (B.V.Sc. & A.H., M.V.Sc.). We help dogs and other pets recover from injury, surgery and mobility problems with physiotherapy, a hydrotherapy pool, acupuncture and electro-physical therapy, with home visits available. We also offer indoor boarding, swimming, grooming and walking. [owner: confirm species treated and any other facts]". No URLs or promotional offers in it.
- [ ] 2.11 Attributes: tick what is true (e.g. wheelchair-accessible entrance, appointment required, online appointments) [owner: confirm each].
- [ ] 2.12 Opening date [owner: confirm].
- [ ] 2.13 Photos (aim 15+ in the first two weeks, then 2-4 a month): exterior with signage and the Avaneesh Heights / Dine in the Clouds landmark, reception, treatment room, **hydrotherapy pool**, equipment, Dr. Dhanvi Patel and team, boarding area, grooming area, pets in therapy (with the owner's permission). Set a cover photo and logo. Real photos only; no stock images. Photos from Instagram can be reused.
- [ ] 2.14 Products (optional): add products/packages the clinic sells if any [owner: confirm; do not invent prices].
- [ ] 2.15 Q&A: Google has been retiring the public Q&A feature in some regions; check whether your profile still shows "Questions & answers". If so, post and answer 5-8 real questions yourself from the owner account (e.g. "Do you offer home visits?", "Is the hydrotherapy pool indoors?", "Is an appointment needed?", "Which pets do you treat?", "Where exactly is the clinic?"). If not available, put the same answers in the business description, Services and a website FAQ. [owner: confirm answers]
- [ ] 2.16 Posts: publish one post a week or at least twice a month (Updates, Offers or Events). Ideas: a recovery story (with permission), what hydrotherapy is, signs your dog needs physio, home-visit availability, boarding open days. Add a photo and a "Call" or "Learn more" button.
- [ ] 2.17 Messaging/chat: only switch on if someone will reply within the day.
- [ ] 2.18 Add the review link (see section 3) and keep a copy of it: GBP > "Get more reviews" > copy short link.
- [ ] 2.19 Check for duplicate listings of the same clinic (search the name and phone on Maps). Report duplicates via "Suggest an edit > Report a problem" or ask Google support to merge.
- [ ] 2.20 Set a monthly calendar reminder: look at Performance (calls, direction requests, searches that found you), reply to every review, post, upload photos.

Category guidance (verification status as of 2026-10-07):

| Category name | Status | Notes |
|---|---|---|
| Veterinarian | **Verified** (appears in published GBP category lists) | Strong candidate for primary: it matches the "pet vet Ahmedabad" query. Only appropriate if the owner is comfortable being listed as a vet; Dr. Patel holds veterinary degrees. |
| Animal Hospital | **Verified** | Implies a hospital with inpatient/surgery; probably not a fit unless the clinic offers that. |
| Pet boarding service | **Verified** | Good secondary (indoor facility/boarding). |
| Pet groomer | **Verified** | Good secondary (grooming). |
| Dog walker | **Verified** | Secondary only if walking is a genuine public service. |
| Dog daycare center | **Verified** | Possible secondary if day care is offered [owner: confirm]. |
| Animal physiotherapy / "Animal physical therapist" | **Unverified exact wording.** One third-party source mentions "Animal physiotherapy" as a secondary option; I could not confirm the exact name on Google's official list | Search the dashboard category box for "animal", "physio", "rehabilitation" and "therapist" and pick the exact wording Google shows. If nothing relevant appears, do not force it; use Veterinarian plus services text. |
| Acupuncturist / "Animal acupuncture" | **Unverified** | Do not select a human acupuncturist category if it misleads; check the dropdown. |

Google's own category list changes; the dashboard dropdown is the source of truth. Suggested starting point for the owner to confirm: primary "Veterinarian" (or the exact animal physiotherapy category if the dropdown offers one and the owner prefers the niche), secondaries "Pet boarding service", "Pet groomer", plus any animal physiotherapy/rehabilitation category found.

Services to list (descriptions in plain language; [owner: confirm each]):

| Service | Draft description |
|---|---|
| Veterinary physiotherapy | Hands-on rehabilitation to restore movement, strength and comfort after injury, surgery or in ageing pets. |
| Hydrotherapy pool | Low-impact swimming and water-based exercise for rehabilitation and conditioning. |
| Acupuncture | Needle therapy used to help manage pain and support recovery. |
| Electro-physical therapy | Machine-assisted therapies to support pain relief and healing. [owner: confirm modalities] |
| Home visits | Physiotherapy at your home for pets who cannot travel easily. [owner: confirm areas] |
| Indoor facility / boarding | Indoor boarding facility for pets. [owner: confirm] |
| Swimming | Supervised swimming sessions. |
| Grooming | Grooming services. [owner: confirm] |
| Walking | Dog walking service. [owner: confirm] |

---

## 3. Reviews (second biggest lever for map-pack ranking and conversion)

Targets: 10 genuine Google reviews in the first 60 days, then 2-4 new ones a month. Ask real clients only.

- [ ] 3.1 Copy the GBP review short link (2.18). Make a QR code from it (any free QR generator) and print it for reception.
- [ ] 3.2 Save the script below in WhatsApp as a saved reply / template.
- [ ] 3.3 **When to ask:** after a visible improvement or at the end of a treatment package (e.g. pet walking better, session 4-6, discharge), within 1-3 days of that moment. Do not ask during a stressful visit or if the owner is upset; resolve the problem first.
- [ ] 3.4 Ask everyone, not just happy clients. Do not filter ("review gating"); Google prohibits it.
- [ ] 3.5 **No incentives.** Do not offer discounts, free sessions, gifts or entries in return for reviews, and do not ask staff/relatives to post fake reviews. This breaks Google policy and can remove reviews or suspend the profile. Do not buy reviews.
- [ ] 3.6 Reply to every review within 48 hours (see reply guide).
- [ ] 3.7 Log requests and results in the table below.

WhatsApp / SMS script (English):

> Hi [Owner name], this is The Pet Physio Vet. It was lovely to see [Pet name] today and we're glad to see the progress. If you have a minute, would you share your honest experience on Google? It helps other pet parents in Ahmedabad find us. Link: [review link]. Thank you! - Dr. Dhanvi Patel's team

Gujarati (transliterated; [owner: have a Gujarati speaker check wording]):

> Namaste [Owner name], The Pet Physio Vet taraf thi. Aaje [Pet name] ne malvanu saras laagyu. Tame ek minute kadhi ne Google par tamaro sacho anubhav lakhsho? Tena thi biji pet owners ne amne shodhva ma madad malse. Link: [review link]. Aabhar! - Dr. Dhanvi Patel ni team

Hindi (transliterated; [owner: have a Hindi speaker check wording]):

> Namaste [Owner name], The Pet Physio Vet ki taraf se. Aaj [Pet name] se milkar bahut accha laga. Agar aapke paas ek minute ho to kya aap Google par apna sachcha anubhav likh sakte hain? Isse Ahmedabad ke doosre pet parents ko hume dhoondhne mein madad milegi. Link: [review link]. Dhanyavaad! - Dr. Dhanvi Patel ki team

Follow-up: one polite reminder after about a week at most, then stop.

Reply guide:

| Review | How to reply |
|---|---|
| Positive | Thank by first name, mention the pet and service in a natural way, no medical promises. E.g. "Thank you, [Name]! Wonderful to see [Pet] enjoying the hydrotherapy sessions. We look forward to your next visit." |
| Mixed / negative | Reply calmly within 48 hours, apologise for the experience without arguing, do not share the pet's medical details publicly, invite them to call +91 72840 73241 or email contact@thepetphysiovet.com, and fix the issue. Never argue or accuse the reviewer of lying. |
| Fake/spam/abusive | Flag it via the "Report review" menu; do not retaliate. |

Review log:

| Date asked | Client (initials) | Channel | Reviewed? | Replied? |
|---|---|---|---|---|
| | | | | |

---

## 4. Citations with identical name, address and phone (NAP)

Consistency across directories reinforces the Business Profile. Use the canonical table at the top, character for character. Add the website link and the same short description on each. Record each URL in the tracker.

Verification note: a web search on 2026-10-07 did not return Justdial or Sulekha listings for this clinic, so **whether they already exist is unconfirmed**. Search each site for the clinic name and phone before creating anything; claim an existing listing rather than adding a duplicate. Whether each site's category suits an animal physio clinic is for the owner to check on signup.

- [ ] 4.1 **Bing Places for Business** (bingplaces.com): import from the Google Business Profile, verify. Feeds Bing Maps and Microsoft Copilot answers.
- [ ] 4.2 **Apple Business Connect** (businessconnect.apple.com): add/claim the place so it shows in Apple Maps and Siri. Add photos and hours.
- [ ] 4.3 **Justdial** (justdial.com, "Free Listing"): search first, then claim or create. Choose categories closest to "Veterinary clinics", "Pet boarding" and "Pet grooming" as shown on the site [owner: confirm available names]. Verification is by phone OTP. Be aware Justdial sales calls are common; the free listing is enough.
- [ ] 4.4 **Sulekha** (sulekha.com): same approach, Ahmedabad.
- [ ] 4.5 **IndiaMART**: only if you sell products; skip if not relevant [owner: decide]. It is a B2B marketplace and not a priority for a clinic.
- [ ] 4.6 **Facebook Business Page** [owner: confirm if one exists]: complete the About section with identical NAP, link to the website and Instagram, add the Instagram link, post the same photos. Add the Facebook URL to the website footer and GBP "social profiles".
- [ ] 4.7 **Instagram** (`https://www.instagram.com/thepetphysiovet/`): make sure the bio carries the clinic area ("Shilaj, Ahmedabad"), phone, the website link and a "Book" or "WhatsApp" button. Tag the location (the clinic's Maps place) on posts/Reels.
- [ ] 4.8 **WhatsApp Business**: use +91 72840 73241 with the catalogue (services), business hours, address and a greeting message; this is the number everywhere.
- [ ] 4.9 Pet and vet directories relevant in India. Check each for Ahmedabad coverage and whether a clinic listing is free [owner/helper: verify]; none were confirmed by search: Practo has vet categories in some cities (unverified for Ahmedabad), Sulekha and Justdial pet categories, WhatClinic (search showed it lists physiotherapy in Ahmedabad, unverified for pets), local "pet-friendly Ahmedabad" directories, pet-service apps and marketplaces.
- [ ] 4.10 Local Ahmedabad pet communities: pet-parent Facebook groups and WhatsApp communities, Instagram pet accounts based in Ahmedabad, Reddit r/ahmedabad. Be a helpful member (answer mobility questions) and follow group rules on promotion. Do not spam.
- [ ] 4.11 Add the clinic's **email, phone and address in the website footer and contact page** exactly like the canonical table, so the site matches the listings.
- [ ] 4.12 Quarterly: search the clinic phone number in Google in quotes (`"72840 73241"`) to find inconsistent or duplicate listings and fix them.

Citation tracker:

| Platform | URL | NAP matches? | Date done |
|---|---|---|---|
| Google Business Profile | | | |
| Bing Places | | | |
| Apple Business Connect | | | |
| Justdial | | | |
| Sulekha | | | |
| Facebook | | | |
| Instagram | https://www.instagram.com/thepetphysiovet/ | | |
| Other | | | |

---

## 5. Link earning (links from real local sites)

A handful of relevant local links does more for a new site than dozens of directory links. Ask for a link to `https://www.thepetphysiovet.com` with the clinic name as the text.

- [ ] 5.1 **Referring vets in Ahmedabad:** make a list of 10 general vets and surgeons (especially orthopaedic/neuro surgeons) who could refer post-surgery or arthritic patients. Offer a short intro visit, a one-page "what we treat and how to refer" PDF, and ask to be listed on their site's "partners/referrals" page. Return the courtesy by listing them on the clinic site (with permission).
- [ ] 5.2 **Vet college / alumni:** Dr. Patel's institution(s) [owner: confirm which] and alumni associations; ask whether alumni-achievement or "our graduates" pages can list the clinic. Veterinary associations in Gujarat [owner: confirm membership] often have member directories.
- [ ] 5.3 **Pet shops, groomers, trainers, rescues, breeders and boarding places** near Shilaj, Bopal and SG Highway: swap links ("trusted partners" pages), offer a talk or demo, offer to put their flyers in the clinic.
- [ ] 5.4 **Rescues and shelters:** offer free assessment days for rescued dogs with mobility issues [owner: confirm willingness]; ask the rescue to mention and link the clinic in their posts and website.
- [ ] 5.5 **Local press angle:** an indoor hydrotherapy pool for pets in Ahmedabad is a story. Pitch Ahmedabad Mirror, Times of India Ahmedabad / Ahmedabad Times, DeshGujarat, Divya Bhaskar, Gujarat Samachar city pages, local lifestyle bloggers and Instagram creators. Include 3 photos, a 100-word description, Dr. Patel's quote and a recovery story (with the pet owner's consent). Do not claim "first" or "only" unless it can be proven [owner: confirm].
- [ ] 5.6 **Local events:** pet expos, adoption drives, dog shows in Ahmedabad; sponsor or exhibit and ask for a listing link.
- [ ] 5.7 **Guest content:** offer short pieces ("How to help an older dog with arthritis walk better") to pet blogs and community pages, with a bio linking to the clinic.
- [ ] 5.8 Log every contact below. Check in Search Console > Links after 4-8 weeks.

| Date | Target | Type | Contacted by | Outcome / link URL |
|---|---|---|---|---|
| | | | | |

---

## 6. AI-assistant baseline (re-run monthly)

AI answers vary from run to run and change with model updates, so treat results as a trend, not a score. The point is to record a dated baseline before the fixes take effect, and repeat the exact same prompts monthly.

How to run: use a fresh/private session each time; same location settings (Ahmedabad); note the date, platform, model/mode and whether web browsing/search was on. Run each prompt on ChatGPT (with search on), Perplexity, Gemini and Claude (with web search on). For repeat variance, run 3 of the prompts twice.

- [ ] 6.1 Run the first baseline now, before any changes go live; save as "Baseline 2026-10".
- [ ] 6.2 Repeat on the first week of each month for at least 6 months.
- [ ] 6.3 Note which competitor clinics are named and which of their pages or listings are cited; that shows which sources to target in sections 2-5.

Prompts (tag in brackets):

1. Best vet in Ahmedabad for dogs [best-for]
2. Pet vet near Shilaj, Ahmedabad [best-for]
3. Dog physiotherapy clinic in Ahmedabad [best-for]
4. Veterinary physiotherapy and rehabilitation Ahmedabad [best-for]
5. Hydrotherapy pool for dogs in Ahmedabad [best-for]
6. Pet swimming pool Ahmedabad for dog rehab [best-for]
7. My dog is limping after surgery, who can help with rehabilitation in Ahmedabad? [problem-led]
8. My older dog has arthritis and trouble climbing stairs; where can I get physiotherapy in Ahmedabad? [problem-led]
9. Dog hip dysplasia physiotherapy Ahmedabad [problem-led]
10. Dog cruciate ligament recovery rehab near me in Ahmedabad [problem-led]
11. My dog can't walk properly after a spinal problem, which clinic in Ahmedabad offers rehab? [problem-led]
12. Does acupuncture for dogs exist in Ahmedabad? [problem-led]
13. Vet who does home visits for pets in Ahmedabad [best-for]
14. Pet physiotherapy at home Ahmedabad [best-for]
15. Pet boarding with a vet on site in Ahmedabad [best-for]
16. Dog grooming and boarding near Shilaj / Thaltej / Bopal [best-for]
17. What is The Pet Physio Vet in Ahmedabad? Is it good? [brand]
18. Dr. Dhanvi Patel veterinary physiotherapist Ahmedabad [brand]
19. How do I choose a vet physiotherapist for my dog? Any good ones in Ahmedabad? [how to choose]
20. Alternatives to a regular vet clinic for dog mobility problems in Ahmedabad [alternatives to]

Baseline log (one row per prompt per platform per run):

| Date | Platform | Model / mode (browsing on?) | Prompt # | Clinic mentioned? | Cited with link? | Position (1st, 2nd, ...) | Competitors named | Competitor pages cited | Notes |
|---|---|---|---|---|---|---|---|---|---|
| [date] | | | | | | | | | |

Monthly summary:

| Month | Platform | Prompts run | Clinic mentioned | Cited with link | Most-cited competitor |
|---|---|---|---|---|---|
| 2026-10 (baseline) | ChatGPT | 20 | | | |
| 2026-10 (baseline) | Perplexity | 20 | | | |
| 2026-10 (baseline) | Gemini | 20 | | | |
| 2026-10 (baseline) | Claude | 20 | | | |

---

## Suggested order and timing

| When | Do |
|---|---|
| Day 1 | Section 1 (Search Console and Bing); start 2.1 (claim GBP); run the section 6 baseline |
| Week 1 | Finish GBP (2.2-2.19), Bing Places, Apple Business Connect, WhatsApp Business, Instagram bio |
| Weeks 2-4 | Start review requests; Justdial, Sulekha, Facebook; first posts and photos |
| Month 2 | Referral vets, pet shops, rescues outreach; press pitch |
| Monthly | GBP post and photos, review replies, Search Console check, AI baseline re-run |

Items marked `[owner: ...]` are facts not supplied; fill them in before publishing anywhere.

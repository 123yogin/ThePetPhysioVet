/**
 * Privacy and terms copy.
 *
 * READ THIS BEFORE EDITING.
 *
 * Everything stated as fact here was verified against the code, not assumed:
 *
 *  - the field list is `EnquiryCreateSerializer` in the clinic API, which is
 *    what the booking form actually posts;
 *  - "no cookies" was measured in the browser -- document.cookie, localStorage
 *    and sessionStorage are all empty on every route, which is also why this
 *    site has no cookie banner;
 *  - the third-party hosts are the ones the page really contacts
 *    (fonts.googleapis.com, fonts.gstatic.com, lh3.googleusercontent.com).
 *    The image host is listed again because the condition illustrations were
 *    restored to the originals, which are served from it. This line tracks
 *    what the site actually loads -- if those images become local again, it
 *    has to come back out.
 *
 * If any of that changes -- an analytics script, a chat widget, a new form
 * field -- this file is now wrong and has to change with it.
 *
 * Contact details ARE now real (email and phone, supplied 2026-09-19) and are
 * written into the rights section.
 *
 * What is still deliberately NOT written here: retention periods, the grievance
 * officer's NAME, and governing law. Those are commitments a business makes,
 * not facts a developer can read off the source, and under India's DPDP Act
 * naming a grievance officer is a legal requirement rather than a nicety.
 * They are marked NEEDS_CLINIC and render as a visible callout so they cannot
 * ship unnoticed.
 */

export const NEEDS_CLINIC = 'NEEDS_CLINIC' as const;

export interface LegalSection {
  heading: string;
  /** Paragraphs. A string equal to NEEDS_CLINIC renders as an unmissable gap. */
  body: (string | typeof NEEDS_CLINIC)[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  /** Human date shown on the page. Bump it whenever the text below changes. */
  lastUpdated: string;
  sections: LegalSection[];
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  lastUpdated: '19 September 2026',
  intro:
    'This page explains what this website collects, why, and who else sees it. '
    + 'It covers the website only — care your pet receives at the clinic is '
    + 'recorded in the clinic’s own patient records.',
  sections: [
    {
      heading: 'What the booking form collects',
      body: [
        'The appointment request form is the only place this site collects '
        + 'anything about you. Four fields are required, because without them '
        + 'the clinic cannot call you back:',
      ],
      bullets: [
        'Your first name, and your last name if you give it',
        'Your email address and phone number',
        'Your pet’s name, and their species and breed if you give them',
        'The service you are asking about, and a preferred date',
        'Anything you write in “reason for visit and symptoms”',
      ],
    },
    {
      heading: 'About that last field',
      body: [
        'Whatever you type about your pet’s symptoms is stored as you wrote it '
        + 'and is read by the clinic’s veterinary staff. It describes your '
        + 'animal’s health, not yours, but it sits alongside your name and phone '
        + 'number. Please include what the clinician needs and nothing more.',
      ],
    },
    {
      heading: 'Where it goes',
      body: [
        'Submissions go to the clinic’s own enquiry inbox, which only signed-in '
        + 'clinic staff can open. An enquiry is not a patient record: a clinician '
        + 'reviews it and decides whether to turn it into an appointment.',
        'It is used to contact you about the appointment you asked for. It is not '
        + 'sold, and it is not used for marketing.',
      ],
    },
    {
      heading: 'Cookies',
      body: [
        'This website sets no cookies. It stores nothing in your browser and does '
        + 'not track you between visits. There is no analytics or advertising '
        + 'script on any page — which is why you were not asked to accept cookies.',
      ],
    },
    {
      heading: 'Other companies that see something',
      body: [
        'Pages load fonts and some illustrations hosted by Google. Requesting a file tells '
        + 'that service your IP address and which page asked for it — this is '
        + 'true of any site using hosted fonts, and it happens whether or not you '
        + 'use the form.',
      ],
      bullets: [
        'fonts.googleapis.com and fonts.gstatic.com — typefaces',
        'lh3.googleusercontent.com — some illustrations used on the site',
      ],
    },
    {
      heading: 'How long it is kept',
      body: [NEEDS_CLINIC],
    },
    {
      heading: 'Your rights, and who to ask',
      body: [
        'You can ask what the clinic holds about you, ask for it to be corrected, '
        + 'or ask for it to be deleted.',
        'Write to contact@thepetphysiovet.com, or call +91 72840 73241, and say '
        + 'what you would like done. It helps to give the phone number you used '
        + 'on the form, since that is how an enquiry is found.',
        // The contact route above is now real. What is still missing is
        // narrower and specific: India's DPDP Act requires a NAMED grievance
        // officer, not just an address to write to, and no name has been given.
        NEEDS_CLINIC,
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  lastUpdated: '19 September 2026',
  intro:
    'These terms cover use of this website. Treatment your pet receives is '
    + 'governed by what the clinic agrees with you directly.',
  sections: [
    {
      heading: 'This site is not veterinary advice',
      body: [
        'The descriptions of conditions and therapies here are general '
        + 'information. They are not a diagnosis and not a treatment plan for your '
        + 'animal, and nothing on this site should be used to delay seeing a vet.',
        'If your pet is in distress, or you think this is an emergency, contact a '
        + 'veterinary surgeon now rather than filling in a form.',
      ],
    },
    {
      heading: 'Requesting an appointment',
      body: [
        'Submitting the form is a request, not a confirmed booking. Nothing is '
        + 'reserved until the clinic contacts you and agrees a time. The reference '
        + 'number shown after you submit identifies your enquiry; it is not a '
        + 'confirmation that a slot exists.',
        'Please give details that are accurate. The clinic acts on what you write '
        + 'about your animal, and it calls the number you provide.',
      ],
    },
    {
      heading: 'Referrals',
      body: [
        'Some services are offered only alongside your pet’s primary '
        + 'veterinarian, and the clinic may ask for a referral and clinical history '
        + 'before beginning a course of treatment.',
      ],
    },
    {
      heading: 'Accuracy',
      body: [
        'The clinic tries to keep this site correct and current, but service '
        + 'details can change. What the clinic tells you directly takes precedence '
        + 'over what is written here.',
      ],
    },
    {
      heading: 'Governing law',
      body: [NEEDS_CLINIC],
    },
  ],
};

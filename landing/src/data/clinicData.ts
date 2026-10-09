import { ConditionItem, ServiceItem, JourneyStep, SuccessStory, Specialist, GalleryItem, FAQItem } from '../types';

// The hero's own poster frame, from the clinic's footage. Used as the last
// resort og:image when SITE.images.ogImage is unset. It was a stock
// googleusercontent URL -- one config change away from representing this
// clinic with somebody else's photograph in every social share.
export const HERO_IMAGE = '/hero-poster.jpg';

export const CONDITIONS: ConditionItem[] = [
  {
    id: 'arthritis',
    title: 'Arthritis',
    seoH1: 'Arthritis in dogs and cats: physiotherapy and pain management in Ahmedabad',
    seoTitle: 'Dog Arthritis Treatment & Physiotherapy in Ahmedabad',
    seoDescription:
      'Arthritis physiotherapy for dogs and cats in Ahmedabad: laser, hydrotherapy, massage, acupuncture and TENS to ease stiffness and rebuild muscle support.',
    category: 'degenerative',
    shortDesc: 'Managing pain and improving joint mobility for aging companions.',
    fullDesc: 'Osteoarthritis is a progressive joint disease affecting cartilage and surrounding bones. Our multi-modal rehabilitation targets stiffness, restores range of motion, and rebuilds muscular support without heavy pharmacological side effects.',
    symptoms: ['Difficulty rising from bed', 'Reluctance to climb stairs or jump', 'Limping or stiffness after rest', 'Licking specific joints'],
    recommendedTherapies: ['Laser Therapy', 'Hydrotherapy', 'Targeted Massage', 'Joint Supplements Plan', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: 'Ongoing maintenance & visible improvement within 3-4 weeks',
    imageUrl:
      '/photos/conditions/arthritis-frame.webp',
    altText: 'Class IV laser therapy being applied to a dog at the clinic',
    videoUrl: '/videos/laser.mp4',
    posterUrl: '/videos/laser-poster.jpg',
  },
  {
    id: 'ivdd',
    title: 'IVDD',
    seoH1: 'IVDD (slipped disc) in dogs: rehabilitation in Ahmedabad',
    seoTitle: 'IVDD in Dogs: Slipped Disc Physiotherapy in Ahmedabad',
    seoDescription:
      'IVDD rehab for dogs in Ahmedabad: electro-acupuncture, TENS, laser and supported swimming in our indoor pool for slipped disc, back pain and weak hind legs.',
    category: 'neurological',
    shortDesc: 'Specialized neurological rehabilitation for spinal conditions.',
    fullDesc: 'Intervertebral Disc Disease affects the spinal column, leading to pain, weakness, or paralysis. Our conservative and post-op spinal protocol focuses on neural stimulation, spinal alignment, proprioceptive re-education, and supported swimming in our indoor pool.',
    symptoms: ['Back pain or arched spine', 'Hind leg weakness or knuckling', 'Incontinence or difficulty standing', 'Shaking or reluctance to move head'],
    recommendedTherapies: ['Electro-acupuncture', 'TENS', 'Hydrotherapy — Indoor Swimming Pool', 'Class IV Laser', 'Neuromuscular Electrical Stimulation', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture'],
    expectedRecoveryTime: '6 to 16 weeks based on severity (Grade I to V)',
    imageUrl:
      '/photos/conditions/ivdd-frame.webp',
    altText: 'A dog swimming in the clinic indoor hydrotherapy pool',
    videoUrl: '/videos/hydrotherapy.mp4',
    posterUrl: '/videos/hydrotherapy-poster.jpg',
  },
  {
    id: 'hip-dysplasia',
    title: 'Hip Dysplasia',
    seoH1: 'Hip dysplasia in dogs: physiotherapy and rehab in Ahmedabad',
    seoTitle: 'Hip Dysplasia Treatment for Dogs & Puppies in Ahmedabad',
    seoDescription:
      'Hip dysplasia physiotherapy for dogs in Ahmedabad: targeted exercise, peanut-ball work, indoor pool swimming and laser to steady the hips and build muscle.',
    category: 'degenerative',
    shortDesc: 'Strengthening musculature to support and stabilize the hip joints.',
    fullDesc: 'A congenital condition where the hip socket fails to fully cover the ball portion of the upper thighbone. Specialized targeted exercise regimens build gluteal and pelvic stabilization muscles, drastically reducing bone-on-bone friction.',
    symptoms: ['Bunny-hopping gait when running', 'Narrow stance in hind legs', 'Decreased hip joint flexibility', 'Loss of thigh muscle mass'],
    recommendedTherapies: ['Physiotherapy', 'Therapeutic Exercise (Peanut Ball)', 'Indoor Swimming Pool', 'Cryotherapy & Heat Modalities', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: '6 to 8 weeks for baseline stabilization',
    imageUrl:
      '/photos/conditions/hip-dysplasia-frame.webp',
    altText: 'A dog in guided aquatic therapy at the clinic pool',
    videoUrl: '/videos/exercise.mp4',
    posterUrl: '/videos/exercise-poster.jpg',
  },
  {
    id: 'post-surgical',
    title: 'Post Surgical Rehab',
    seoH1: 'Post-surgical rehabilitation for dogs in Ahmedabad',
    seoTitle: 'Post-Surgery Dog Physiotherapy (TPLO) in Ahmedabad',
    seoDescription:
      'Post-surgery rehab for dogs in Ahmedabad after TPLO, CCL, FHO or fracture repair. We work with your surgeon on swelling, strength and a natural gait.',
    category: 'post-op',
    shortDesc: 'Accelerated and safe recovery protocols following orthopedic procedures.',
    fullDesc: 'Essential care post-TPLO, CCL repair, FHO, or fracture repair. We work closely with your surgeon to control post-op edema, promote surgical site incisional healing, prevent muscle atrophy, and re-establish a natural symmetrical gait.',
    symptoms: ['Surgical site swelling', 'Non-weight bearing limb stance', 'Stiffness after cage rest', 'Loss of range of motion'],
    recommendedTherapies: ['Class IV Laser Therapy', 'Passive Range of Motion (PROM)', 'Controlled Aquatic Gait Retraining', 'Home Cryotherapy Protocol', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: '8 to 12 weeks guided post-op milestones',
    imageUrl:
      '/photos/conditions/post-surgical-frame.webp',
    altText: 'Class IV laser therapy on a dog during post-surgical recovery',
    videoUrl: '/videos/laser.mp4',
    posterUrl: '/videos/laser-poster.jpg',
  },
  {
    id: 'neurological-recovery',
    title: 'Neurological Recovery',
    seoH1: 'Neurological recovery and paralysis rehab for dogs in Ahmedabad',
    seoTitle: 'Dog Paralysis, Ataxia & Neurological Rehab in Ahmedabad',
    seoDescription:
      'Dog paralysis and neurological rehab in Ahmedabad: spinal stroke (FCE), degenerative myelopathy, ataxia and nerve injury. Exercise, stimulation, hydrotherapy.',
    category: 'neurological',
    shortDesc: 'Retraining pathways to restore balance, coordination, and mobility.',
    fullDesc: 'Targeted neurological rehab for spinal stroke (FCE), degenerative myelopathy (DM), cerebellar ataxia, and nerve trauma. We stimulate neuroplasticity using proprioceptive tracks, wobble boards, and aquatic buoyancy.',
    symptoms: ['Loss of paw position awareness', 'Unsteady, wobbling gait', 'Weakness in all limbs', 'Difficulty keeping balance'],
    recommendedTherapies: ['Proprioceptive Circuit Exercises', 'Electrical Muscle Stimulation', 'Hydrotherapy', 'Laser Therapy', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: '8 to 20 weeks individualized neural program',
    imageUrl:
      '/photos/conditions/neurological-recovery-frame.webp',
    altText: 'A dog doing guided aquatic exercise during neurological rehabilitation',
    videoUrl: '/videos/exercise.mp4',
    posterUrl: '/videos/exercise-poster.jpg',
  },
  {
    id: 'sports-injury',
    title: 'Sports Injury',
    seoH1: 'Sports and working-dog injury rehabilitation in Ahmedabad',
    seoTitle: 'Dog Sports Injury Physiotherapy & Recovery in Ahmedabad',
    seoDescription:
      'Sports injury physiotherapy for dogs in Ahmedabad: strains, sprains and tendonitis in agility and working dogs. Biomechanical assessment, laser, recovery plan.',
    category: 'lifestyle',
    shortDesc: 'Targeted recovery plans to get your active dog back to peak performance.',
    fullDesc: 'Agility, flyball, working dogs, and energetic companions frequently suffer tendonitis, iliopsoas strains, and ligament sprains. Our biomechanical evaluation isolates subtle compensations and repairs tissue integrity.',
    symptoms: ['Shortened stride length', 'Reluctance to jump obstacles', 'Intermittent lameness after exercise', 'Local muscle twitching or soreness'],
    recommendedTherapies: ['High-Power Laser', 'Myofascial Trigger Point Release', 'Aquatic Conditioning', 'Plyometric Strength Building', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: '4 to 10 weeks to return to agility & outdoor sports',
    imageUrl:
      '/photos/conditions/sports-injury-frame.webp',
    altText: 'A dog in guided aquatic conditioning at the clinic',
    videoUrl: '/videos/exercise.mp4',
    posterUrl: '/videos/exercise-poster.jpg',
  },
  {
    id: 'senior-mobility',
    title: 'Senior Mobility',
    seoH1: 'Mobility care for senior dogs and cats in Ahmedabad',
    seoTitle: 'Senior Dog Mobility Care & Arthritis Physio in Ahmedabad',
    seoDescription:
      'Senior dog mobility care in Ahmedabad: gentle massage, warm-water hydrotherapy, balance work and non-slip advice for older dogs and cats who are slowing down.',
    category: 'lifestyle',
    shortDesc: 'Gentle therapies designed to maintain independence and comfort in older age.',
    fullDesc: 'Aging pets deserve dignity, comfort, and vital motion. Our senior care plans safely boost endurance, maintain core muscle tone, ease stiff spinal joints, and enhance mental engagement in a low-stress environment.',
    symptoms: ['Slipping on hardwood floors', 'Slower walk speed', 'Muscle wasting in hips', 'Vocalizing when standing'],
    recommendedTherapies: ['Gentle Massage', 'Warm Water Hydrotherapy Walk', 'Low-Impact Balance Matting', 'Nonslip Assistive Gear Consultation', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: 'Continuous weekly or bi-weekly comfort care program',
    imageUrl:
      '/photos/conditions/senior-mobility-frame.webp',
    altText: 'A senior dog resting with its owner during a gentle care session',
    videoUrl: '/videos/senior.mp4',
    posterUrl: '/videos/senior-poster.jpg',
  },
  {
    id: 'obesity-rehab',
    title: 'Obesity Rehab',
    seoH1: 'Weight loss and obesity rehabilitation for dogs in Ahmedabad',
    seoTitle: 'Dog Obesity & Weight Loss Programme in Shilaj, Ahmedabad',
    seoDescription:
      'Dog obesity and weight-loss rehab in Ahmedabad: low-impact swimming in our indoor pool, structured exercise and weight milestones for overweight dogs and cats.',
    category: 'lifestyle',
    shortDesc: 'Safe, structured exercise programs for healthy weight management.',
    fullDesc: 'Excess weight severely compounds joint stress, heart strain, and diabetes risk. Swimming in our indoor pool lets your pet work without the joint impact of walking on hard ground, thanks to the buoyancy of the water.',
    symptoms: ['Inability to feel ribcage easily', 'Excessive panting during short walks', 'Lethargy and low stamina', 'Difficulty grooming'],
    recommendedTherapies: ['Indoor Pool Swimming Sessions', 'Targeted Metabolic Caloric Plan', 'Land Resistance Walks', 'Progressive Weight Milestones', 'Pulsed electro-magnetic field (PEMF)', 'Acupuncture', 'Electro-acupuncture', 'TENS'],
    expectedRecoveryTime: '8 to 16 weeks target body condition restoration',
    imageUrl:
      '/photos/conditions/obesity-rehab-frame.webp',
    altText: 'A dog swimming in the hydrotherapy pool for weight management',
    videoUrl: '/videos/hydrotherapy.mp4',
    posterUrl: '/videos/hydrotherapy-poster.jpg',
  }
];

export const SERVICES: ServiceItem[] = [
  {
    id: 'indoor-physiotherapy',
    title: 'Indoor Physiotherapy',
    seoH1: 'Residential physiotherapy for dogs and cats at our Shilaj clinic',
    seoTitle: 'Residential Pet Physiotherapy in Shilaj, Ahmedabad',
    seoDescription:
      'Residential physiotherapy in Shilaj, Ahmedabad for dogs and cats from out of town: your pet stays for their course, with special care for food and hygiene.',
    icon: 'night_shelter',
    shortDesc: 'Residential care for patients travelling from outside the city.',
    fullDesc: 'For patients coming from out of the city: your pet stays at the clinic for their course of physiotherapy.',
    benefits: [
      'For patients from outside the city',
      'Special care — food and hygiene',
      'Supervised during clinic hours (9:30 AM \u2013 1:30 PM)',
      'Stay with pet-pond'
    ],
    suitableFor: [],
    duration: 'By arrangement'
  },
  {
    id: 'manual-therapy',
    title: 'Manual Therapy',
    seoH1: 'Manual therapy and massage for dogs and cats',
    seoTitle: 'Manual Therapy & Soft Tissue Massage for Dogs in Ahmedabad',
    seoDescription:
      'Hands-on manual therapy for dogs and cats in Ahmedabad: massage, therapeutic exercise, strength training and acupressure, adjusted for each pet in the session.',
    icon: 'front_hand',
    shortDesc: 'Hands-on treatment delivered directly by a clinician.',
    fullDesc: 'Hands-on treatment delivered directly by a clinician, selected and adjusted for each animal during the session.',
    benefits: ['Massage', 'Therapeutic exercise', 'Strength training', 'Acupressure'],
    suitableFor: [],
    duration: 'Assessed per pet'
  },
  {
    id: 'electrophysical',
    title: 'Electro-physical Therapy',
    seoH1: 'Laser and electrotherapy for dogs and cats',
    seoTitle: 'Laser & Electrotherapy for Dog Arthritis Pain in Ahmedabad',
    seoDescription:
      'Class IV laser, PEMF, ultrasound, TENS, NMES and electro-acupuncture for dogs and cats in Ahmedabad, applied under clinical supervision as recovery progresses.',
    icon: 'bolt',
    shortDesc: 'Equipment-assisted therapies applied under clinical supervision.',
    fullDesc: 'Equipment-assisted therapies applied under clinical supervision, chosen to suit the animal and the stage of their recovery.',
    benefits: [
      'Pulsed electro-magnetic field (PEMF)',
      'Class IV laser therapy',
      'Ultrasound therapy',
      'TENS',
      'NMES',
      'Electro-acupuncture'
    ],
    suitableFor: [],
    duration: 'Assessed per pet'
  },
  {
    id: 'hydrotherapy',
    title: 'Hydrotherapy',
    seoH1: 'Hydrotherapy for dogs in Ahmedabad',
    seoTitle: 'Dog Hydrotherapy in Ahmedabad | The Pet Physio Vet',
    seoDescription:
      'Dog hydrotherapy in Ahmedabad: supported swimming in our lukewarm indoor pool with a hydrotherapist alongside. For IVDD, post-surgery, arthritis, weight loss.',
    icon: 'star',
    shortDesc: 'Supported swimming in our indoor, lukewarm pool.',
    fullDesc: 'Hydrotherapy in an indoor swimming pool kept at lukewarm temperature (29-31\u00b0C), with a dedicated hydrotherapist in the water alongside your pet.',
    benefits: [
      'Indoor swimming pool, clean and filtered',
      'Lukewarm water, kept at 29-31\u00b0C (84-88\u00b0F)',
      'A dedicated hydrotherapist in the water with your pet',
      'Flotation aid where it helps',
      'Gradual introduction, with treats and praise',
      'Under the observation of the vet'
    ],
    suitableFor: [
      'IVDD and spinal conditions',
      'Recovery after orthopaedic surgery',
      'Overweight dogs',
      'Senior dogs with stiff joints',
      'Arthritis and hip dysplasia',
      'Neurological recovery',
      'Active and sporting dogs'
    ],
    duration: 'Assessed per pet'
  },
  {
    id: 'acupuncture',
    title: 'Acupuncture',
    seoH1: 'Veterinary acupuncture for dogs and cats in Ahmedabad',
    seoTitle: 'Dog & Cat Acupuncture in Ahmedabad | The Pet Physio Vet',
    seoDescription:
      "Veterinary acupuncture and electro-acupuncture for dogs and cats in Ahmedabad with Dr. Dhanvi Patel (CVA), alongside the rest of your pet's rehab.",
    icon: 'sparkles',
    shortDesc: 'Acupuncture and electro-acupuncture, with a certified veterinary acupuncturist.',
    fullDesc: 'Acupuncture and electro-acupuncture, used alongside the rest of your pet\'s rehabilitation plan. Dr. Dhanvi Patel holds a CVA, Certified Veterinary Acupuncturist, from Chi University, U.S.A.',
    benefits: [
      'Acupuncture',
      'Electro-acupuncture',
      'Certified Veterinary Acupuncturist (CVA), Chi University, U.S.A.',
      'Combined with laser, hydrotherapy and manual therapy as needed'
    ],
    suitableFor: [
      'Arthritis',
      'IVDD and spinal conditions',
      'Hip dysplasia',
      'Post-surgical recovery',
      'Neurological recovery',
      'Sports injury',
      'Senior mobility'
    ],
    duration: 'Assessed per pet'
  },
  {
    id: 'home-care',
    title: 'Home Care',
    seoH1: 'Home-visit pet physiotherapy across Ahmedabad',
    seoTitle: 'Dog Physiotherapy at Home in Ahmedabad | The Pet Physio Vet',
    seoDescription:
      'Dog and cat physiotherapy at home in Ahmedabad: a home exercise programme, massage and surface guidance so care continues between your pet\'s clinic visits.',
    icon: 'home',
    shortDesc: 'A programme to continue your pet\'s care at home.',
    fullDesc: 'A home exercise programme and supporting guidance, so care continues between visits to the clinic.',
    benefits: [
      'Home exercise programme',
      'Exercise at home',
      'Massage',
      'Food',
      'Supplements',
      'Basic & special care',
      'Surface guidance'
    ],
    suitableFor: [],
    duration: 'Ongoing'
  }
];

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    number: '01',
    title: 'Assessment',
    desc: 'A full evaluation of mobility and condition.',
    details: 'A thorough 60-minute consultation including gait analysis, muscle mass girth measurement, joint range-of-motion testing, and neurological reflex check.',
    whatToExpect: ['Medical history review', 'Symmetrical stance inspection', 'Goniometer joint range testing', 'Initial pain & comfort scoring']
  },
  {
    number: '02',
    title: 'Diagnosis',
    desc: 'Clear identification of the underlying issues.',
    details: 'Combining veterinary referral notes, digital palpation findings, and functional testing to pinpoint structural, muscular, or neurological limitations.',
    whatToExpect: ['Detailed biomechanical summary', 'Identification of compensation zones', 'Primary vs secondary pain mapping', 'Direct consultation with your primary vet']
  },
  {
    number: '03',
    title: 'Personalized Therapy',
    desc: 'A plan built from the therapies that suit your pet — hydrotherapy, laser, manual therapy, and acupuncture as needed.',
    details: 'Crafting a dedicated multi-week therapy schedule blending indoor pool hydrotherapy, Class IV laser, manual joint mobilization, and acupuncture as needed.',
    whatToExpect: ['Hands-on therapeutic sessions', 'Gentle, zero-fear approach', 'Immediate post-treatment icing/heat', 'Customized treatment frequency (1-3x/week)']
  },
  {
    number: '04',
    title: 'Progress Tracking',
    desc: 'Regular monitoring and plan adjustments.',
    details: 'Re-evaluating muscle measurements and comfort metrics every 4 sessions to adapt exercise difficulty and track objective functional gains.',
    whatToExpect: ['Objective video gait comparisons', 'Re-measurement of limb girth', 'Home exercise plan progression', 'Transparent owner progress reports']
  },
  {
    number: '05',
    title: 'Recovery',
    desc: 'Restored mobility, less pain, and a happier life.',
    details: 'Graduating to maintenance or sports re-conditioning, ensuring your companion enjoys long-term, pain-free mobility and vitality.',
    whatToExpect: ['Graduation milestone certificate', 'Long-term maintenance recommendations', 'Seasonal check-in schedule', 'Full return to favorite activities']
  }
];

/**
 * The clinic's current Google Business Profile rating, shown above the
 * reviews on the homepage (not emitted as schema — see seo/schema.ts). The clinic's owner manages that profile directly, so this
 * is confirmed from the live listing rather than scraped or estimated.
 *
 * MUST BE KEPT IN SYNC BY HAND with the live profile
 * (https://maps.google.com/?cid=16829298020285027612) — there is no API
 * wired up to pull this automatically, so it will drift as new reviews come
 * in until someone updates it. Last confirmed 2026-10-07: 5.0 stars, 24
 * reviews (also 5.0 / 23 on Justdial).
 */
export const GOOGLE_RATING = {
  ratingValue: '5',
  bestRating: '5',
  reviewCount: 24,
};

/**
 * Genuine excerpts from the clinic's Google Business Profile (5.0 stars, 24
 * reviews), published at the business owner's direction — the owner manages
 * that profile and gave these specifically to replace the template fiction
 * this array used to hold ("Sarah & James M." on an invented dog named
 * Bella, "Elena R." on an invented IVDD case — fabricated clients quoted by
 * name about fabricated patients on a real veterinary practice's homepage,
 * the same template defect as the three fabricated clinicians SPECIALISTS
 * once carried).
 *
 * Each `quote` is verbatim from the profile (only a leading "& " / "..." may
 * be trimmed) — never paraphrased, never invented. No reviewer gave a full
 * name on the profile, so `ownerName` is "Google review" rather than a
 * guessed one; `petName`, `breed`, `condition` and `storyDetails` are left
 * out entirely because none of these three reviewers stated them — the
 * `SuccessStory` type makes those fields optional for exactly this case.
 *
 * They are shown on the page only. They are NOT emitted as Review /
 * AggregateRating schema: Google treats a business's own reviews of itself
 * as self-serving (see the header of seo/schema.ts).
 */
export const SUCCESS_STORIES: SuccessStory[] = [
  {
    id: 'google-review-1',
    quote: 'They also recently added Class 4 Laser therapy, which is unique in such a setup.',
    ownerName: 'Google review',
    rating: 5,
    source: 'Google',
  },
  {
    id: 'google-review-2',
    quote: 'Her clinic itself is a great environment for all pets.',
    ownerName: 'Google review',
    rating: 5,
    source: 'Google',
  },
  {
    id: 'google-review-3',
    quote: 'Dr Dhanvi is a blessing, such a healing soul and such loving hands.',
    ownerName: 'Google review',
    rating: 5,
    source: 'Google',
  },
];

export const SPECIALISTS: Specialist[] = [
  // The clinic's actual clinician, taken from its own production record
  // (UserProfile: Dhanvi Patel, role DOCTOR, clinic "Pet Physio Vet").
  //
  // This list previously held three people who do not work here — Dr. Sarah
  // Jenkins, Dr. Mark Roberts and Emma Davies — carried over from the site
  // template, complete with invented DVM/CCRP/RVN credentials, invented years
  // in practice, invented biographies and stock photographs. They were not
  // merely decorative: they had their own /specialists/* pages, they were
  // listed in the sitemap, they populated the "Preferred Specialist" dropdown
  // on the booking form, and they were published to Google as `employee`
  // Person nodes of a real, named veterinary business with
  // `EducationalOccupationalCredential` entries attached. Fabricated clinical
  // credentials for a real medical practice are not a placeholder problem.
  //
  // Everything below that is empty is empty ON PURPOSE. Every consumer of this
  // record skips a field it cannot fill, and `prune()` in seo/schema.ts drops
  // empty values from the JSON-LD, so nothing unverified reaches a visitor or
  // a search engine. Fill these in once the clinic supplies the real details.
  //
  // `credentials`, `bio` and `specialties` below are not written here from
  // scratch — every claim is a restatement of the clinic's own published
  // description in seo/siteConfig.ts, which was taken from its Google Business
  // listing: "Qualified veterinary physiotherapist (M.V.Sc.) treating mobility
  // problems, post-surgical recovery, arthritis and injury in dogs and cats,
  // with avian and exotic experience. Clinic visits at Shilaj, Ahmedabad,
  // Road, and home visits across Ahmedabad." Nothing is added to it.
  //
  // `experienceYears` was left at 0 because no source stated a number at the
  // time; the doctor has since confirmed 2+ years of clinical practice before
  // this website existed (the clinic predates the site), so it is now set to
  // 2 -- a stated fact, not a guess. Both photos below are her own, supplied
  // by the clinic -- never a stock photograph of someone else.
  {
    id: 'dhanvi-patel',
    name: 'Dr. Dhanvi Patel',
    seoTitle: 'Dr. Dhanvi Patel, Veterinary Physiotherapist, Ahmedabad',
    seoH1: 'Dr. Dhanvi Patel, veterinary physiotherapist',
    role: 'Veterinary Physiotherapist',
    // Supplied by the clinic, 2026-09-18. Separated by ';' because two of
    // these contain commas of their own.
    //
    // `credentialsShort` is what the card and modal show -- the full list
    // below runs to four qualifications with awarding bodies and countries,
    // which buries the name it is meant to support. The profile page shows
    // all of them.
    credentialsShort: 'B.V.Sc. & A.H. · M.V.Sc.',
    credentials:
      'B.V.Sc. & A.H.'
      + '; M.V.Sc. in Veterinary Clinical Medicine, Ethics and Jurisprudence'
      + '; Certified Veterinary Physiotherapy — Animal Rehabilitation and Health Care, U.K.'
      + '; CVA, Certified Veterinary Acupuncturist — Chi University, U.S.A.',
    bio:
      'Qualified veterinary physiotherapist (M.V.Sc.) treating mobility problems, '
      + 'post-surgical recovery, arthritis and injury in dogs and cats, with '
      + 'experience in avian and exotic patients. Sees patients at the Shilaj '
      + 'clinic and on home visits across Ahmedabad.',
    specialties: [
      'Veterinary acupuncture',
      'Mobility and gait problems',
      'Post-surgical recovery',
      'Arthritis management',
      'Injury rehabilitation',
      'Avian and exotic patients',
      'Home visits across Ahmedabad',
    ],
    experienceYears: 2,
    // Her own photograph, supplied by the clinic 2026-09-19. Identity is not
    // assumed: the scrub embroidery in the same set reads "Thepetphysio /
    // Dr. Dhanvi Pa... / Veterinary Physio...", which is her own uniform.
    imageUrl: '/photos/dhanvi-patel.webp',
    altText:
      'Dr. Dhanvi Patel sitting on the therapy mats at the clinic, holding a beagle',
    // Formal standalone portrait, used only on the dedicated profile page; the
    // homepage "about" card keeps the warmer beagle photo above.
    portraitUrl: '/photos/dhanvi-portrait.webp',
    portraitAlt:
      'Dr. Dhanvi Patel, veterinary physiotherapist and acupuncturist, in her The Pet Physio Vet clinic scrub',
  },
];

/**
 * The clinic's own photographs.
 *
 * Every entry here used to be a stock image from googleusercontent captioned as
 * this practice's premises -- "Welcoming Reception Area", "Hydrotherapy Suite &
 * Indoor Swimming Pool", "Private Manual Therapy Suite", "Class IV Laser
 * Photobiomodulation System". Those were claims about rooms and equipment
 * illustrated with someone else's building.
 *
 * What the clinic has actually supplied is four usable photographs, all of the
 * clinician with patients -- two at the Shilaj premises, two on home visits.
 * None of them shows a reception, a pool, a treatment room or any equipment, so
 * the captions describe what is in the frame and nothing else. The gallery is
 * shorter as a result, which is the honest outcome.
 *
 * A fifth photograph from the same set is deliberately unused: it carries a
 * visible "AI-generated content" watermark from AI photo editing, which has no
 * place on a veterinary clinic's website.
 *
 * Still wanted, to say anything about the facility itself: the reception, the
 * indoor pool, the therapy room, and equipment in use.
 */
export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'g1',
    title: 'On the therapy mats',
    category: 'At the clinic',
    imageUrl: '/photos/clinic-german-shepherd.webp',
    altText:
      'Dr. Dhanvi Patel holding a German Shepherd on the padded therapy mats at the Shilaj clinic'
  },
  {
    id: 'g2',
    title: 'A home visit in Ahmedabad',
    category: 'Home visits',
    imageUrl: '/photos/home-visit-labradors.webp',
    altText:
      'Dr. Dhanvi Patel sitting on the floor with two Labradors during a home visit'
  },
  {
    id: 'g3',
    title: 'Caring for older patients',
    category: 'Home visits',
    imageUrl: '/photos/senior-beagle.webp',
    altText:
      'Dr. Dhanvi Patel with a senior beagle, grey around the muzzle, during a home visit'
  },
  {
    id: 'g5',
    title: 'Every kind of dog',
    category: 'Home visits',
    imageUrl: '/photos/home-visit-indie.webp',
    altText:
      'An Indian pariah dog resting against Dr. Dhanvi Patel during a home visit'
  },

  // The clinic's own reels. They carry the captions they were published with --
  // these are the practice's social posts, not stock footage dressed up as
  // documentary, and stripping the text would mean re-cutting somebody's work.
  // Only the poster frame is loaded in the grid; the file itself is fetched
  // when a visitor opens it.
  {
    id: 'r1',
    title: 'A Pomeranian back on his feet',
    category: 'Patient stories',
    imageUrl: '',
    altText: 'Still from a reel following a white Pomeranian through his recovery',
    videoUrl: '/reels/reel-pool-recovery.mp4',
    previewUrl: '/reels/reel-pool-recovery-loop.mp4'
  },
  {
    id: 'r2',
    title: 'A Labrador learning to stand again',
    category: 'Patient stories',
    imageUrl: '',
    altText: 'Still from a reel following a Labrador through hydrotherapy and exercise',
    videoUrl: '/reels/reel-labrador-hydrotherapy.mp4',
    previewUrl: '/reels/reel-labrador-hydrotherapy-loop.mp4'
  },
  {
    id: 'r3',
    title: 'A senior German Shepherd',
    category: 'Patient stories',
    imageUrl: '',
    altText: 'Still from a reel of an elderly German Shepherd receiving therapy',
    videoUrl: '/reels/reel-senior-shepherd.mp4',
    previewUrl: '/reels/reel-senior-shepherd-loop.mp4'
  },
  {
    id: 'r4',
    title: 'How a session works',
    category: 'From the clinic',
    imageUrl: '',
    altText: 'Still from a reel in which Dr. Dhanvi Patel explains a physiotherapy session',
    videoUrl: '/reels/reel-therapy-explained.mp4',
    previewUrl: '/reels/reel-therapy-explained-loop.mp4'
  }
];

export const FAQS: FAQItem[] = [
  {
    id: 'faq1',
    category: 'General',
    question: 'Do I need a referral from my regular vet?',
    answer: 'Yes, in most cases we require a referral from your primary care veterinarian to ensure we have your pet\'s complete medical history, surgical reports, X-rays, and can coordinate their care safely and effectively. No referral? Call us and we\'ll advise you on the next step.'
  },
  {
    id: 'faq2',
    category: 'Sessions',
    question: 'How long is a typical rehabilitation session?',
    answer: 'Initial assessments take 60 minutes. Follow-up treatment sessions typically last between 30 to 45 minutes, depending on your pet\'s specific needs, condition, and stamina.'
  },
  {
    id: 'faq3',
    category: 'General',
    question: 'Can I stay with my pet during treatment?',
    answer: 'Absolutely! We strongly encourage owners to be present during sessions. It keeps your pet calm and comfortable, and allows us to teach you gentle home care and massage techniques.'
  },
  {
    id: 'faq4',
    category: 'Insurance',
    question: 'Does pet insurance cover physiotherapy?',
    answer: 'Some pet insurance policies cover physiotherapy and hydrotherapy when your vet recommends it — check your policy. We provide itemised receipts you can submit to your insurer.'
  },
  {
    id: 'faq5',
    category: 'Sessions',
    question: 'How many sessions will my pet need?',
    answer: 'Every case is unique. Post-surgical patients usually benefit from a 6 to 8-week block (1-2 times weekly), while chronic conditions like arthritis often shift into bi-weekly or monthly maintenance once stabilized.'
  },
  {
    id: 'faq6',
    category: 'General',
    question: 'What if my dog is nervous around water?',
    answer: 'Your pet is introduced to our indoor pool gradually, never rushed, with a dedicated hydrotherapist in the water alongside them and a flotation aid where it helps. Water temperature is kept at a soothing 29-31°C (84-88°F), and treats/praise are used throughout.'
  }
];

/**
 * The treatment Services recommended for a condition — the SINGLE matcher used
 * both by the condition page's visible "Treatments used for X" list and by the
 * JSON-LD related-service nodes (seo/schema.ts), so the two can never diverge.
 * Two-way substring match between each recommended therapy and a service title;
 * the first-word token is guarded against '' (an empty therapy string used to
 * make `title.includes('')` match every service).
 */
export function servicesForCondition(condition: ConditionItem): ServiceItem[] {
  return SERVICES.filter((service) =>
    condition.recommendedTherapies.some((therapy) => {
      const t = therapy.toLowerCase();
      const title = service.title.toLowerCase();
      const firstWord = t.split(' ')[0];
      // Pool/aquatic/swimming therapies are hydrotherapy even when the word is not used.
      if (service.id === 'hydrotherapy' && /\b(pool|aquatic|swimming|swim)\b/.test(t)) return true;
      return t.includes(title) || (firstWord !== '' && title.includes(firstWord));
    }),
  );
}

/**
 * When the clinical (condition) content was last reviewed by the vet.
 * CONTENT_REVIEWED_DATE is the machine value for schema.org `lastReviewed`
 * (ISO 8601); CONTENT_REVIEWED_DISPLAY is the human string shown on the page.
 * Both are fixed constants (never computed from the clock) so server and client
 * markup are identical — no hydration drift. Bump both together when the
 * condition content is materially revised.
 */
export const CONTENT_REVIEWED_DATE = '2026-10-03';
export const CONTENT_REVIEWED_DISPLAY = 'October 2026';

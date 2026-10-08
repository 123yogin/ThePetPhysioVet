/**
 * Long-form copy for the /treatments/* pages.
 *
 * Content rule: every clinic-specific statement below (the indoor pool, its
 * 29-31 C lukewarm water, the hydrotherapist in the water, flotation aid,
 * treats and praise, the 60-minute assessment, 30-45 minute follow-ups, the
 * list of electro-physical modalities, Dr. Patel's CVA credential, home visits
 * across Ahmedabad) is restated from clinicData.ts / siteConfig.ts. Everything
 * else is general, non-clinic-specific explanation of what the therapy is, who
 * it typically helps and when a vet may advise against it. No prices, session
 * counts, equipment or outcomes are introduced here.
 *
 * Inline links use [[label|/path]] and are rendered by ServicePage; the FAQPage
 * JSON-LD uses the plain-text form (see `plainText`), so the visible answer and
 * the structured data say the same thing.
 */

export interface TreatmentSection {
  heading: string;
  paragraphs: string[];
}

export interface TreatmentContent {
  sections: TreatmentSection[];
  faqs: Array<{ q: string; a: string }>;
}

/** Strip [[label|/path]] link tokens down to their label. */
export const plainText = (text: string): string => text.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1');

const REFERRAL =
  'Bring your own vet\'s referral notes, X-rays and any surgical reports if you have them, so care can be coordinated safely.';

export const TREATMENT_CONTENT: Record<string, TreatmentContent> = {
  hydrotherapy: {
    sections: [
      {
        heading: 'What hydrotherapy is and why it helps',
        paragraphs: [
          'Hydrotherapy is exercise done in water. The buoyancy of the water takes weight off the joints and spine, so a dog that struggles on hard ground can move, stretch and build muscle with far less impact. The resistance of the water also makes the muscles work, which is why the same session can support strength, balance and fitness.',
          'At The Pet Physio Vet in Shilaj, Ahmedabad, hydrotherapy takes place in an indoor swimming pool kept at a lukewarm 29 to 31 degrees Celsius (84 to 88 degrees Fahrenheit), with clean, filtered water, under the observation of the vet. Warm water also helps stiff muscles relax, which is part of why it suits older and sore dogs.',
        ],
      },
      {
        heading: 'What a hydrotherapy session looks like',
        paragraphs: [
          'Your dog is introduced to the pool gradually and never rushed. A dedicated hydrotherapist is in the water alongside your dog, a flotation aid is used where it helps, and treats and praise are used throughout so the pool becomes a good place to be. Owners are encouraged to be present, which keeps most pets calmer.',
          'Hydrotherapy is planned after a full assessment, not offered as a one-size-fits-all swim. It is blended with other treatments in a multi-week schedule, and the frequency is set for each pet. Bring your vet\'s referral notes, X-rays and any surgical reports so the plan fits your pet\'s history.',
        ],
      },
      {
        heading: 'Who hydrotherapy can help',
        paragraphs: [
          'Water work appears in the treatment plans on our condition pages. It is used for [[IVDD and spinal conditions|/conditions/ivdd]] (supported swimming), [[post-surgical recovery|/conditions/post-surgical]] (controlled aquatic gait retraining), [[obesity and weight management|/conditions/obesity-rehab]] (low-impact swimming), [[senior mobility|/conditions/senior-mobility]] (a warm-water walk), [[arthritis|/conditions/arthritis]], [[hip dysplasia|/conditions/hip-dysplasia]], [[neurological recovery|/conditions/neurological-recovery]] and [[sports injury|/conditions/sports-injury]] (aquatic conditioning).',
          'Dogs that are overweight, stiff, recovering from an operation or losing strength in the hind legs are the usual candidates. Pets that dislike water are not forced: the gradual introduction above is how we work with nervous dogs.',
        ],
      },
      {
        heading: 'When hydrotherapy may not be suitable',
        paragraphs: [
          'Water therapy is not right for every pet at every stage. Reasons your vet physiotherapist may delay or avoid it include open or unhealed wounds and surgical incisions that have not been cleared, skin or ear infections, fever or being generally unwell, and some heart, breathing or seizure conditions. Your vet will check these at the assessment and coordinate with your own vet before any pool session.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does my dog need to be able to swim for hydrotherapy?',
        a: 'No. Dogs are introduced to the pool gradually, with a dedicated hydrotherapist in the water alongside them and a flotation aid where it helps. The goal is supported, controlled movement, not strong swimming.',
      },
      {
        q: 'What if my dog is nervous around water?',
        a: 'Your dog is introduced to the indoor pool gradually and never rushed. Treats and praise are used throughout, and you are welcome to stay with your pet. A dog that is not ready is not forced into the water.',
      },
      {
        q: 'How warm is the hydrotherapy pool in Ahmedabad?',
        a: 'The indoor pool is kept lukewarm, at 29 to 31 degrees Celsius (84 to 88 degrees Fahrenheit). Warm water is comfortable for stiff joints and helps muscles relax.',
      },
      {
        q: 'Is hydrotherapy safe after surgery?',
        a: 'It can be, once your surgeon and vet confirm that the incision has healed enough for water. We work with your surgeon, and the timing is set at assessment. Conditions such as open wounds are a reason to wait.',
      },
      {
        q: 'Which conditions is dog hydrotherapy used for?',
        a: 'Water work is part of the plans for IVDD and other spinal conditions, post-surgical recovery, obesity, senior mobility, arthritis, hip dysplasia, neurological recovery and sports injury. Your assessment decides whether it suits your dog.',
      },
      {
        q: 'Do I need a referral for hydrotherapy?',
        a: `In most cases we ask for a referral from your primary vet so we have your pet's medical history. If you do not have one, call us and we will advise the next step. ${REFERRAL}`,
      },
    ],
  },

  acupuncture: {
    sections: [
      {
        heading: 'What veterinary acupuncture is',
        paragraphs: [
          'Acupuncture is the placing of very fine, sterile needles at specific points on the body. In animals it is used mainly to help manage pain and to support mobility. Electro-acupuncture is a variation in which a mild electrical current is passed between needles. Research on acupuncture in animals is still developing, so it is used as one part of a wider rehabilitation plan and not as a stand-alone cure.',
          'Acupressure, the same idea applied with the hands instead of needles, is part of our [[manual therapy|/treatments/manual-therapy]].',
        ],
      },
      {
        heading: 'Who performs acupuncture here',
        paragraphs: [
          'Dr. Dhanvi Patel, our veterinary physiotherapist, holds a CVA, Certified Veterinary Acupuncturist, from Chi University, U.S.A. She also holds an M.V.Sc., a B.V.Sc. & A.H. and a Certified Veterinary Physiotherapy qualification from the U.K., and lists veterinary acupuncture among her specialties. You can read her full profile on the [[team page|/team/dhanvi-patel]].',
        ],
      },
      {
        heading: 'What to expect in a session',
        paragraphs: [
          'Acupuncture is considered only after a full assessment, which takes about 60 minutes at the first visit. If it is suitable, needles are placed at points chosen for your pet\'s problem. Many animals settle quietly, and you are encouraged to stay with your pet. Follow-up sessions typically last 30 to 45 minutes in total, because acupuncture is often combined with other treatments such as laser, [[hydrotherapy|/treatments/hydrotherapy]] and manual work.',
          'Electro-acupuncture is also listed with our [[electro-physical therapies|/treatments/electrophysical]], since it uses an electrical stimulator.',
        ],
      },
      {
        heading: 'Conditions where acupuncture is used',
        paragraphs: [
          'Acupuncture and electro-acupuncture appear in the plans for [[arthritis|/conditions/arthritis]], [[IVDD|/conditions/ivdd]], [[hip dysplasia|/conditions/hip-dysplasia]], [[post-surgical rehab|/conditions/post-surgical]], [[neurological recovery|/conditions/neurological-recovery]], [[sports injury|/conditions/sports-injury]], [[senior mobility|/conditions/senior-mobility]] and [[obesity rehab|/conditions/obesity-rehab]]. In every case it supports the rest of the programme rather than replacing your vet\'s treatment.',
        ],
      },
      {
        heading: 'When acupuncture may not be suitable',
        paragraphs: [
          'Your vet will check whether acupuncture is appropriate before starting. Things that call for caution include bleeding or clotting disorders, pregnancy, infection or a lump at the planned site, and, for electro-acupuncture, a pacemaker or other implanted electronic device. Tell us about all medicines your pet takes.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does acupuncture hurt my dog or cat?',
        a: 'The needles are very fine, and most animals tolerate them calmly. Some feel a brief sensation as a needle is placed. You can stay with your pet during the session.',
      },
      {
        q: 'What is electro-acupuncture?',
        a: 'Electro-acupuncture connects a small stimulator to acupuncture needles so that a mild electrical current passes between them. It is used in our plans for conditions such as IVDD, arthritis and neurological recovery, alongside other therapies.',
      },
      {
        q: 'Who does acupuncture at The Pet Physio Vet?',
        a: 'Dr. Dhanvi Patel, veterinary physiotherapist, holds a CVA, Certified Veterinary Acupuncturist, from Chi University, U.S.A., and lists veterinary acupuncture among her specialties. She sees patients at the Shilaj clinic in Ahmedabad.',
      },
      {
        q: 'Can acupuncture replace my pet\'s medication?',
        a: 'No. Acupuncture is used alongside your vet\'s treatment, not instead of it. Never stop or change a medicine without speaking to your own vet.',
      },
      {
        q: 'How many acupuncture sessions will my pet need?',
        a: 'It depends on the condition and on how your pet responds, so it is set at assessment and reviewed as treatment goes on. Plans commonly combine acupuncture with other modalities over several weeks.',
      },
    ],
  },

  'indoor-physiotherapy': {
    sections: [
      {
        heading: 'What indoor physiotherapy is',
        paragraphs: [
          'Indoor physiotherapy is our residential option for patients travelling from outside the city. Instead of making the journey to Ahmedabad for every session, your pet stays at the clinic for their course of physiotherapy, with special care for food and hygiene.',
          'It follows the same programme as any other patient, so your pet gets a full assessment first and a plan built around their condition. It can include [[hydrotherapy|/treatments/hydrotherapy]], laser and other [[electro-physical therapies|/treatments/electrophysical]], [[manual therapy|/treatments/manual-therapy]] and [[acupuncture|/treatments/acupuncture]] as needed.',
        ],
      },
      {
        heading: 'Why a residential course can help',
        paragraphs: [
          'Rehabilitation works best when sessions are regular, and treatment frequency is often between one and three sessions a week. For an owner living some distance away, repeated long journeys can be hard on the family and on a pet that is sore or recovering from surgery. A supervised stay keeps the routine consistent and spares your pet the travel.',
        ],
      },
      {
        heading: 'What happens at the first visit',
        paragraphs: [
          'The first visit is a thorough 60-minute assessment: medical history review, gait analysis, muscle-girth measurement, joint range-of-motion testing and a neurological reflex check. We use the findings and your vet\'s notes to agree a plan. Bring your own vet\'s referral notes, X-rays and surgical reports if you have them.',
          'Owners are encouraged to be present for sessions, and we teach gentle home care so the work continues after discharge. Our [[home care programme|/treatments/home-care]] covers the exercises, massage and surface guidance to follow at home.',
        ],
      },
      {
        heading: 'Who it suits',
        paragraphs: [
          'Residential physiotherapy is for pets that need a structured course and cannot easily attend as day patients, for example after spinal or orthopaedic surgery or during [[neurological recovery|/conditions/neurological-recovery]]. If your pet lives in Ahmedabad and can travel comfortably, day sessions at the Shilaj clinic or a home visit may be simpler. Ask us which fits.',
        ],
      },
      {
        heading: 'Residential physiotherapy or boarding?',
        paragraphs: [
          'Residential physiotherapy is a course of treatment. If your pet does not need rehab and only needs looking after while you are away or busy, see [[pet boarding and day care in Shilaj|/services/pet-boarding]] instead: supervised care round the clock in our Indoor Facility, booked by the hour, day, week or month.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Who is indoor physiotherapy for?',
        a: 'It is for patients coming from outside the city, whose pets stay at the clinic for their course of physiotherapy, with special care for food and hygiene.',
      },
      {
        q: 'Do I need a referral for indoor physiotherapy?',
        a: `In most cases we ask for a referral from your primary vet. If you do not have one, call us and we will advise the next step. ${REFERRAL}`,
      },
      {
        q: 'How long is the first appointment?',
        a: 'The initial assessment takes about 60 minutes. Follow-up treatment sessions typically last 30 to 45 minutes, depending on your pet\'s condition and stamina.',
      },
      {
        q: 'Can I stay with my pet during treatment?',
        a: 'Yes. Owners are encouraged to be present during sessions. It keeps pets calm and lets us teach you gentle home care and massage.',
      },
      {
        q: 'What happens when the course ends?',
        a: 'You go home with a programme to continue the work, including exercises and guidance on surfaces, massage, food and supplements. See the home care page for details.',
      },
    ],
  },

  'manual-therapy': {
    sections: [
      {
        heading: 'What manual therapy is',
        paragraphs: [
          'Manual therapy is hands-on treatment delivered directly by a clinician. At The Pet Physio Vet in Ahmedabad it covers massage, therapeutic exercise, strength training and acupressure, selected and adjusted for each animal during the session. Joint mobilisation and myofascial trigger point release are among the techniques that appear in our treatment plans.',
          'Because the clinician\'s hands feel how tissue is responding, the treatment can be changed minute by minute. That is the main strength of manual work compared with equipment alone.',
        ],
      },
      {
        heading: 'What each technique is for',
        paragraphs: [
          'Massage eases muscle tension and tightness, which commonly build up when a pet favours a sore limb. Therapeutic exercise uses controlled movements to improve strength, balance and range of motion, and strength training builds on that once your pet is ready. Acupressure applies finger pressure to the points used in acupuncture, without needles.',
          'Signs that manual therapy may help include stiffness after rest, reluctance to jump or climb, shortened stride, muscle wasting, and tightness or flinching when touched along the back or hips.',
        ],
      },
      {
        heading: 'Where it fits in a plan',
        paragraphs: [
          'Manual therapy is rarely used alone. It is combined with [[electro-physical therapies|/treatments/electrophysical]], [[hydrotherapy|/treatments/hydrotherapy]] and a [[home programme|/treatments/home-care]]. You will find it in plans for [[arthritis|/conditions/arthritis]], [[sports injury|/conditions/sports-injury]], [[senior mobility|/conditions/senior-mobility]] and [[post-surgical rehab|/conditions/post-surgical]].',
          'Owners are encouraged to stay with their pet, and we teach gentle massage you can continue at home between visits.',
        ],
      },
      {
        heading: 'Looking after your pet after a session',
        paragraphs: [
          'Some pets feel pleasantly tired after hands-on work, and a few are a little sore for a day, much as a person can be after a deep massage. Offer fresh water, keep activity gentle for the rest of the day and continue the exercises you have been given. If your pet seems more lame, painful or unwell than before the session, tell us so we can adjust the next one.',
          'Progress is measured against objective goals at every session, such as stride, range of motion and how comfortably your pet rises, so changes to the plan are based on what we measure and not only on how things look.',
        ],
      },
      {
        heading: 'When manual therapy may need to wait',
        paragraphs: [
          'Your vet will check first whether hands-on work is safe. Reasons to delay or modify it include a recent or unstable fracture, fever or infection, open wounds or skin lesions, an unexplained lump, and acute inflammation. A full assessment of about 60 minutes at the first visit identifies these before treatment begins.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Does manual therapy hurt my dog?',
        a: 'It should not. Pressure is adjusted to your pet\'s comfort, and the clinician watches their response throughout. If your pet is painful in an area, the technique is changed.',
      },
      {
        q: 'What techniques are included in manual therapy?',
        a: 'Massage, therapeutic exercise, strength training and acupressure, chosen for each animal. Joint mobilisation and myofascial trigger point release also appear in our plans.',
      },
      {
        q: 'Can I learn massage to do at home?',
        a: 'Yes. We encourage owners to be present and teach gentle home care and massage so the work continues between visits.',
      },
      {
        q: 'How long is a manual therapy session?',
        a: 'The first assessment takes about 60 minutes. Follow-up sessions typically last 30 to 45 minutes, depending on your pet\'s needs and stamina.',
      },
      {
        q: 'Is manual therapy suitable for cats?',
        a: 'Our veterinary physiotherapist treats both dogs and cats. Whether hands-on work suits your cat is decided at assessment, as with every pet.',
      },
    ],
  },

  electrophysical: {
    sections: [
      {
        heading: 'What electro-physical therapy is',
        paragraphs: [
          'Electro-physical therapies are equipment-assisted treatments applied under clinical supervision at our Shilaj clinic in Ahmedabad, chosen to suit the animal and the stage of their recovery. The modalities we use are pulsed electro-magnetic field therapy (PEMF), Class IV laser, ultrasound, TENS, NMES and electro-acupuncture.',
        ],
      },
      {
        heading: 'The modalities, in plain terms',
        paragraphs: [
          'Class IV laser delivers light energy to tissue and is used to help reduce pain and support healing. TENS (transcutaneous electrical nerve stimulation) sends mild pulses through the skin to ease pain. NMES (neuromuscular electrical stimulation) makes muscles contract, which can help limit muscle loss when a pet cannot use a limb normally.',
          'Therapeutic ultrasound uses sound waves that produce gentle warmth in deeper tissue. PEMF applies pulsed magnetic fields to the area being treated. Electro-acupuncture passes a mild current between acupuncture needles; see our [[acupuncture page|/treatments/acupuncture]]. Evidence for each of these varies by condition, which is why they are used as part of a combined plan, not alone.',
        ],
      },
      {
        heading: 'What a session is like',
        paragraphs: [
          'Most of these treatments are comfortable and many pets rest through them. Laser safety, such as eye protection, is standard practice, and settings are chosen for your pet by the veterinary physiotherapist. The first appointment is a 60-minute assessment; follow-up sessions typically last 30 to 45 minutes, and electro-physical treatments are often delivered alongside [[manual therapy|/treatments/manual-therapy]] or [[hydrotherapy|/treatments/hydrotherapy]].',
        ],
      },
      {
        heading: 'Conditions where it is used',
        paragraphs: [
          'These therapies appear in the plans for [[IVDD|/conditions/ivdd]], [[arthritis|/conditions/arthritis]], [[post-surgical rehab|/conditions/post-surgical]], [[neurological recovery|/conditions/neurological-recovery]], [[hip dysplasia|/conditions/hip-dysplasia]], [[sports injury|/conditions/sports-injury]] and [[senior mobility|/conditions/senior-mobility]].',
        ],
      },
      {
        heading: 'How progress is tracked',
        paragraphs: [
          'Equipment is only useful when it is matched to a goal. Each plan starts from the assessment findings, such as pain scores, range of motion and muscle girth, and progress is measured against objective goals at every session. If a modality is not helping, it is changed. We also coordinate with your primary vet, so any medicines your pet takes are taken into account when planning.',
        ],
      },
      {
        heading: 'When these treatments need caution',
        paragraphs: [
          'Your vet will check before using any equipment. Common reasons for caution are suspected or known tumours at the treatment site, pregnancy, an implanted pacemaker or other electronic device (for electrical therapies), growing animals near the growth plates (for ultrasound), and the eyes (for laser). Tell us about all medicines and implants your pet has.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Which electro-physical therapies do you offer?',
        a: 'Pulsed electro-magnetic field therapy (PEMF), Class IV laser, ultrasound, TENS, NMES and electro-acupuncture, applied under clinical supervision.',
      },
      {
        q: 'Is laser therapy painful for dogs and cats?',
        a: 'Laser therapy is generally comfortable, and many pets find the gentle warmth relaxing. Settings are chosen for each pet by the veterinary physiotherapist.',
      },
      {
        q: 'Which therapy will my pet get?',
        a: 'It is decided after the assessment. The choice depends on your pet\'s condition, the stage of recovery and what your primary vet has advised. Most plans combine several modalities.',
      },
      {
        q: 'How long does a session last?',
        a: 'The first assessment takes about 60 minutes. Follow-up sessions typically last 30 to 45 minutes, depending on your pet\'s needs and stamina.',
      },
      {
        q: 'Can electrical therapy be used on a pet with an implant?',
        a: 'It needs care. Tell us about any pacemaker or implant before treatment. Your vet will decide whether an electrical modality is safe or whether another option is better.',
      },
    ],
  },

  'home-care': {
    sections: [
      {
        heading: 'What the home care programme is',
        paragraphs: [
          'Home care is a programme that continues your pet\'s rehabilitation between visits. It includes a home exercise programme, massage, guidance on food and supplements, basic and special care, and guidance on the surfaces your pet walks and rests on. Rehabilitation depends on what happens at home as much as in the clinic, so the programme is written for your pet and your home.',
        ],
      },
      {
        heading: 'Home visits across Ahmedabad',
        paragraphs: [
          'Dr. Dhanvi Patel sees patients at the Shilaj clinic and on home visits across Ahmedabad. A home visit can suit a pet that is hard to move, anxious in the car, elderly or recovering at home after surgery.',
          'Some treatments stay at the clinic: hydrotherapy takes place in our [[indoor pool|/treatments/hydrotherapy]]. The home plan is built to complement clinic sessions.',
        ],
      },
      {
        heading: 'What you will be asked to do',
        paragraphs: [
          'Your physiotherapist will show you the exercises, how often to repeat them and what to watch for. Surface guidance is part of this: slippery floors are a common problem for pets with weak hind legs, and the right footing makes exercise safer. We also teach gentle massage, because owners are encouraged to stay with their pet during sessions and learn as they go.',
          'Keep to the programme you are given rather than adding extra exercise, and let us know if your pet seems more sore, tired or reluctant afterwards.',
        ],
      },
      {
        heading: 'Making your home safer for recovery',
        paragraphs: [
          'Small changes make a large difference. Keep non-slip rugs or mats where your pet walks and gets up, keep food and water within easy reach, and limit stairs and jumping on and off furniture unless your physiotherapist says otherwise. A ramp or a sling can help some pets, and we can advise on assistive gear for your pet.',
          'It helps to keep a short diary or a few phone videos of your pet walking. Showing them at the next visit lets your physiotherapist see how your pet moves at home, which is not always the same as in the clinic.',
        ],
      },
      {
        heading: 'Who benefits most',
        paragraphs: [
          'Home care helps pets after [[post-surgical rehab|/conditions/post-surgical]], dogs with [[neurological conditions|/conditions/neurological-recovery]], [[senior pets|/conditions/senior-mobility]] and any pet whose rehabilitation continues after discharge. It works best alongside [[manual therapy|/treatments/manual-therapy]] and clinic sessions.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Do you do home visits in Ahmedabad?',
        a: 'Yes. Dr. Dhanvi Patel sees patients at the Shilaj clinic and on home visits across Ahmedabad. Call us to arrange a visit for your area.',
      },
      {
        q: 'What is in the home care programme?',
        a: 'A home exercise programme, massage, guidance on food and supplements, basic and special care, and surface guidance, so care continues between visits to the clinic.',
      },
      {
        q: 'Can a bedbound or paralysed pet have physiotherapy at home?',
        a: 'Home visits are used for pets that are hard to move. Your assessment decides what can be done at home and what needs the clinic. We work with your primary vet.',
      },
      {
        q: 'Is hydrotherapy available at home?',
        a: 'No. Hydrotherapy takes place in the clinic\'s indoor swimming pool, so home visits focus on exercise, massage and care guidance.',
      },
      {
        q: 'Will I still need clinic visits?',
        a: 'Often, yes. The home programme supports clinic treatment and does not replace it. Your plan is reviewed at follow-up visits.',
      },
    ],
  },
};

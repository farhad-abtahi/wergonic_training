// ============================================================
// Mission Cards Data
// 25 posture training knowledge cards for the daily mission system.
// Each card has: id, title, why, action, checkpoint, tags, triggerRule
// triggerRule: null = always eligible (random pool)
//              string = JS expression evaluated against last session stats
// ============================================================

const MISSION_CARDS = [

  // ===== CONSTRUCTION WORKERS =====
  {
    id: 'lift-001',
    title: 'Lift with Legs, Not Back',
    why: 'Improper lifting and bending at the waist significantly increase risk of acute and cumulative low-back injuries (OSHA). The NIOSH lifting model shows spinal loading is a primary risk factor for injury.',
    action: 'Squat down, keep your back neutral, and lift by straightening your legs instead of bending your waist.',
    checkpoint: 'After your session: did you avoid bending your back in most lifts?',
    tags: ['lifting', 'trunk'],
    triggerRule: null
  },

  {
    id: 'lift-002',
    title: 'Keep Load Close to Body',
    why: 'Lifting with the load far from the body increases spinal load and reduces safe weight limits (NIOSH lifting equation: horizontal distance factor). :contentReference[oaicite:0]{index=0}',
    action: 'Hold the object against your torso at waist level; avoid reaching with extended arms.',
    checkpoint: 'After your session: did you keep the load close in most lifts?',
    tags: ['lifting'],
    triggerRule: null
  },

  {
    id: 'lift-003',
    title: 'Avoid Twisting Your Spine',
    why: 'Twisting and asymmetric lifting increase biomechanical stress and are key ergonomic risk factors for musculoskeletal disorders. :contentReference[oaicite:1]{index=1}',
    action: 'Turn your whole body with your feet instead of twisting your back while carrying a load.',
    checkpoint: 'After your session: did you avoid twisting movements while lifting?',
    tags: ['trunk'],
    triggerRule: null
  },

  {
    id: 'lift-004',
    title: 'Stabilize Before Lifting',
    why: 'Poor posture and unstable positioning increase cumulative spinal stress and injury risk (EU-OSHA ergonomics principles).',
    action: 'Stand close to the load with feet apart and ensure a clear path before lifting.',
    checkpoint: 'After your session: did you prepare your stance before each lift?',
    tags: ['posture'],
    triggerRule: null
  },


  // ===== CAREGIVERS =====
  {
    id: 'care-001',
    title: 'Adjust Bed Height First',
    why: 'Working at improper height increases trunk flexion and low-back force. Adjusting bed height allows upright posture and reduces spinal load. :contentReference[oaicite:2]{index=2}',
    action: 'Raise or lower the bed so you can work with an upright back (around waist level).',
    checkpoint: 'After your session: did you adjust the bed before most tasks?',
    tags: ['caregiving', 'trunk'],
    triggerRule: null
  },

  {
    id: 'care-002',
    title: 'Work Close to the Patient',
    why: 'Greater horizontal distance increases physical load and injury risk according to the NIOSH lifting model. :contentReference[oaicite:3]{index=3}',
    action: 'Move closer to the patient before handling; avoid reaching or leaning forward.',
    checkpoint: 'After your session: did you stay close during patient handling?',
    tags: ['caregiving'],
    triggerRule: null
  },

  {
    id: 'care-003',
    title: 'Minimize Manual Lifting',
    why: 'Patient handling is a major source of musculoskeletal injuries, and assistive devices significantly reduce spinal load and injury risk. :contentReference[oaicite:4]{index=4}',
    action: 'Use hoists, slide sheets, or ask for help instead of lifting patients manually.',
    checkpoint: 'After your session: did you use equipment or assistance when needed?',
    tags: ['caregiving'],
    triggerRule: null
  },

  {
    id: 'care-004',
    title: 'Keep Upright Posture',
    why: 'Maintaining an upright trunk reduces compressive and shear forces on the lower back during patient handling. :contentReference[oaicite:5]{index=5}',
    action: 'Keep your back straight and bend your knees during transfers.',
    checkpoint: 'After your session: did you maintain an upright posture?',
    tags: ['trunk'],
    triggerRule: null
  },

  {
    id: 'care-005',
    title: 'Coordinate and Communicate',
    why: 'Poor coordination increases sudden load forces and injury risk during handling tasks (OSHA healthcare ergonomics guidance).',
    action: 'Explain movements to the patient and coordinate timing with coworkers.',
    checkpoint: 'After your session: did you communicate before moving the patient?',
    tags: ['caregiving'],
    triggerRule: null
  }

];


// ─── Trigger Rule Evaluator ───────────────────────────────────
// Evaluates a card's triggerRule against current user context.
// context: { lastSession, noHistory }
function evaluateTriggerRule(rule, context) {
    if (!rule) return true; // null = always eligible
    try {
        const lastSession = context.lastSession || null;
        const noHistory = context.noHistory || false;
        // eslint-disable-next-line no-new-func
        return !!new Function('lastSession', 'noHistory', `return !!(${rule})`)(lastSession, noHistory);
    } catch {
        return false;
    }
}

// Export for use in gamification.js
window.MISSION_CARDS = MISSION_CARDS;
window.evaluateTriggerRule = evaluateTriggerRule;

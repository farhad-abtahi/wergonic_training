// ============================================================
// Mission Cards Data
// 25 posture training knowledge cards for the daily mission system.
// Each card has: id, title, why, action, checkpoint, tags, triggerRule
// triggerRule: null = always eligible (random pool)
//              string = JS expression evaluated against last session stats
// ============================================================

const MISSION_CARDS = [

    // ─────────────── TRUNK (8 cards) ───────────────

    {
        id: 'trunk-001',
        title: 'Reduce Trunk Forward Lean',
        why: 'Sustained forward lean increases pressure on the lumbar spine and intervertebral discs — one of the leading causes of occupational low-back pain. Even a 5° tilt can increase spinal load by approximately threefold.',
        action: 'Before picking up a tool, take a deep breath and consciously straighten your back so that your ears, shoulders, and hips align vertically.',
        checkpoint: 'After your session: did your green-zone time increase by at least 5% compared to last time?',
        tags: ['trunk'],
        triggerRule: 'lastSession && lastSession.redPct > 20'
    },
    {
        id: 'trunk-002',
        title: 'Control Lateral Bending',
        why: 'Habitual sideways leaning during work causes asymmetric development of the muscles on either side of the spine, which can lead to chronic pain over time.',
        action: 'Check your workstation height. Keep both feet flat on the floor and position tools and materials directly in front of you to avoid lateral reaching.',
        checkpoint: 'During today\'s session, notice whether you tend to lean to one side and count how many times you catch yourself doing it.',
        tags: ['trunk'],
        triggerRule: null
    },
    {
        id: 'trunk-003',
        title: 'Fight Fatigue-Induced Lean',
        why: 'Research shows that after 60–90 minutes of work, core-muscle fatigue causes an involuntary increase in forward lean of 15–20°, significantly raising injury risk.',
        action: 'Set a micro-break reminder every 45 minutes. During the break, do 5 cat-cow stretches: on all fours, alternate between arching and rounding your back to reset spinal awareness.',
        checkpoint: 'Look at the last one-third of today\'s session: is your red-zone time noticeably higher than in the first third? That\'s a sign of fatigue.',
        tags: ['trunk'],
        triggerRule: 'lastSession && lastSession.segments && lastSession.segments.last_third && lastSession.segments.first_third && (lastSession.segments.last_third.greenPct < lastSession.segments.first_third.greenPct - 15)'
    },
    {
        id: 'trunk-004',
        title: 'Hourly Posture Reset',
        why: 'Maintaining any single trunk position for a long time causes static muscular load to accumulate. Periodic "resets" release pressure and prevent posture patterns from becoming fixed.',
        action: 'After completing each task, stand tall, place your hands on your hips, and gently extend backwards for 3–5 seconds (don\'t over-extend). This movement is your "posture reset."',
        checkpoint: 'Today, practice completing at least 3 posture resets — do one immediately after each vibration alert.',
        tags: ['trunk'],
        triggerRule: null
    },
    {
        id: 'trunk-005',
        title: 'Activate Your Core',
        why: 'The core muscles (transverse abdominis and multifidus) are the spine\'s natural protection system. A conscious, gentle abdominal draw-in can increase spinal stability by up to 40%.',
        action: 'Before working, try a "10% draw-in": not a hard contraction, but a gentle inward pull of the abdomen to feel a slight muscular tension. Maintain this awareness throughout the work session.',
        checkpoint: 'Try to keep your core activated during training. Check: is your average green-zone angle smaller than usual today?',
        tags: ['trunk'],
        triggerRule: null
    },
    {
        id: 'trunk-006',
        title: 'Adjust Chair and Workbench Height',
        why: 'Workbench height is strongly correlated with forward lean angle. For every 5 cm the bench is too low, trunk forward lean typically increases by about 3–5° to compensate.',
        action: 'Check your workstation: when seated, your thighs should be parallel to the floor and the bench at elbow height. When standing, the bench should be slightly below elbow height (about 5–10 cm).',
        checkpoint: 'Spend 3 minutes adjusting your bench height today, then compare how comfortable it feels before and after.',
        tags: ['trunk'],
        triggerRule: null
    },
    {
        id: 'trunk-007',
        title: 'The Power of Micro-Breaks',
        why: 'Taking 3–5 minute micro-breaks every 30–45 minutes can reduce work-related musculoskeletal discomfort by up to 60% without affecting overall productivity.',
        action: 'Use the "2-2-2 rule": every 2 hours of work, take 2 minutes of walking and 2 minutes of stretching. This is a recovery protocol designed specifically for factory and craft work.',
        checkpoint: 'Complete 2 micro-break protocols today. Note how long it takes your body to recover its comfortable feeling each time.',
        tags: ['trunk'],
        triggerRule: 'lastSession && lastSession.vibrationCount > 8'
    },
    {
        id: 'trunk-008',
        title: 'Neutral Spine Memory Training',
        why: 'Neutral spine is not "perfectly upright" — it means preserving your spine\'s natural S-curve. In this position, spinal loading is most evenly distributed and easiest to sustain.',
        action: 'Find your neutral position: sitting or standing, first lean as far forward as possible, then as far back as possible, then find the midpoint between the two — that\'s your neutral spine. Return to this feeling every 10 minutes during today\'s session.',
        checkpoint: 'After this session, is your average deviation angle lower than last time?',
        tags: ['trunk'],
        triggerRule: null
    },

    // ─────────────── ARM (8 cards) ───────────────

    {
        id: 'arm-001',
        title: 'Keep Arms Close to Your Body',
        why: 'Every additional 15° of arm abduction increases shoulder-muscle load by about 1.5×. Sustained arm displacement throughout the day is a major risk factor for shoulder impingement and neck pain.',
        action: 'While working today, imagine holding two eggs under your armpits to keep your arms adducted. After each vibration alert, consciously bring your arms closer to your body before continuing.',
        checkpoint: 'This session: are your arm vibration counts fewer than last time? Is green-zone time above 70%?',
        tags: ['arm'],
        triggerRule: 'lastSession && lastSession.redPct > 20'
    },
    {
        id: 'arm-002',
        title: 'Optimal Elbow Flexion Angle',
        why: 'Forearm muscle torque is minimized when the elbow is flexed at 90°. Deviating from this angle raises the risk of carpal tunnel and cubital tunnel syndrome.',
        action: 'Check your typical working posture: ideally, your elbow should be bent at about 90° with the wrist in a neutral position (not bent). Adjust your tool-grip height or body position to achieve this.',
        checkpoint: 'Pay attention to your elbow angle today and try to maintain close to 90° throughout your workflow.',
        tags: ['arm'],
        triggerRule: null
    },
    {
        id: 'arm-003',
        title: 'Use Forearm Support',
        why: 'Resting the forearm on a surface during work can reduce shoulder-muscle load by 60–70%, making it a key technique for prolonged precision work.',
        action: 'Assess your tasks: can you add a wrist rest or forearm support? Even temporarily resting your forearm on the edge of the workbench can significantly reduce shoulder burden.',
        checkpoint: 'Try at least one forearm-support method today and observe whether the green-zone time on the arm sensor increases.',
        tags: ['arm'],
        triggerRule: null
    },
    {
        id: 'arm-004',
        title: 'Optimise Wrist Posture',
        why: 'Bending or twisting the wrist more than 15° increases pressure inside the tendon sheaths by 3–5×, a direct risk factor for carpal tunnel syndrome.',
        action: 'Check how you hold your tools: the wrist should remain neutral (straight). If the tool\'s handle angle forces your wrist to bend, consider changing your grip direction or using an angled-handle tool.',
        checkpoint: 'Actively monitor your wrist position during today\'s work. Check whether your wrist is bent whenever you receive a vibration alert.',
        tags: ['arm'],
        triggerRule: null
    },
    {
        id: 'arm-005',
        title: 'Reduce Shoulder Elevation',
        why: 'Chronically elevated shoulders (shrugging) keeps the trapezius under constant tension and is a common cause of neck-shoulder syndrome and headaches.',
        action: 'Set a "shoulder drop" reminder every 15 minutes: consciously lower both shoulders away from your ears for 5 seconds. Pay particular attention during fine, precise tasks.',
        checkpoint: 'Look at the vibration-dense zones in today\'s session: during the period with the most vibrations, were you performing tasks that required raised shoulders?',
        tags: ['arm'],
        triggerRule: 'lastSession && lastSession.vibrationCount > 10'
    },
    {
        id: 'arm-006',
        title: 'Minimise Overhead Reaching',
        why: 'Raising the arm above shoulder level (beyond 60° of shoulder flexion) multiplies neck compression by 2–3×. Even brief, repeated overhead motions accumulate into a significant risk.',
        action: 'Reorganise your work area: the most frequently used tools and materials should sit in the "golden zone" — between shoulder height and waist height. Eliminate operations that require reaching high.',
        checkpoint: 'Today, identify which steps require overhead arm movement. Count three instances and find one layout improvement you can make.',
        tags: ['arm'],
        triggerRule: null
    },
    {
        id: 'arm-007',
        title: 'Alternate Between Both Hands',
        why: 'Long-term dominant-side-only work leads to cumulative injury on that side while the opposite-side muscles atrophy, further worsening the imbalance. Even 5% non-dominant hand use can reduce dominant-side cumulative load by 60%.',
        action: 'Today, try completing at least 2–3 simple operations with your non-dominant hand (such as carrying light objects or flipping switches). This is the first step toward correcting the imbalance.',
        checkpoint: 'Did you try alternating hands today? Record the tasks you could comfortably perform with your non-dominant hand.',
        tags: ['arm'],
        triggerRule: null
    },
    {
        id: 'arm-008',
        title: 'Correct Tool Grip Force',
        why: 'Research shows that people typically apply 3–5× more force when holding tools than is actually needed. Excessive grip force causes premature forearm-muscle fatigue and tendinitis.',
        action: 'Today, practise the "minimum force principle": imagine reducing each tool grip from 10/10 force to 4/10 — enough to control the tool, but without unnecessary muscle contraction.',
        checkpoint: 'After work, do your hands and forearms feel more relaxed than usual? That is the direct signal of a reduced grip force.',
        tags: ['arm'],
        triggerRule: null
    },

    // ─────────────── GENERAL (9 cards) ───────────────

    {
        id: 'general-001',
        title: 'Introduction to Posture Awareness',
        why: 'Building proprioception (body-position sense) requires sustained attentional training. Research shows that four weeks of conscious posture monitoring can reduce poor working postures by 40%.',
        action: 'Today\'s goal is simple: every time you receive a vibration alert, stop, spend 3 seconds feeling your current posture, then correct it. This "Stop – Feel – Adjust" loop is the core of awareness training.',
        checkpoint: 'How many "Stop – Feel – Adjust" cycles did you complete today? That number is your awareness training score for the day.',
        tags: ['general'],
        triggerRule: 'noHistory'
    },
    {
        id: 'general-002',
        title: 'Understanding Your RULA Risk Score',
        why: 'RULA (Rapid Upper Limb Assessment) is an internationally recognised ergonomic risk-assessment tool scored 0–100, where lower is safer. Knowing your score helps you quantify your progress.',
        action: 'After today\'s session, check your RULA risk score: Green (0–25) = Low risk, Yellow (26–50) = Moderate, Orange (51–75) = High risk, Red (76–100) = Very high risk. Your goal is to keep lowering this score.',
        checkpoint: 'What is your RULA score today? How does it compare to what you expected?',
        tags: ['general'],
        triggerRule: 'noHistory'
    },
    {
        id: 'general-003',
        title: '5-Minute Pre-Session Warm-Up',
        why: 'Warming up before work can reduce early fatigue-related posture deterioration by 35% while improving the quality of posture control during the first part of the session.',
        action: 'Before today\'s session:\n1. Gentle neck circles × 5\n2. Shoulder rolls × 10 (5 forward, 5 backward)\n3. Gentle side bends × 5 each side\n4. Wrist circles × 10 (5 each direction)',
        checkpoint: 'Begin your session immediately after the warm-up. In the first 10 minutes, is your posture control better than when you skip the warm-up?',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-004',
        title: 'Breathing and Posture',
        why: 'Shallow chest breathing causes compensatory shoulder elevation and increased thoracic kyphosis. Deep diaphragmatic breathing naturally activates the diaphragm and stabilises the thoracolumbar junction.',
        action: 'During work today, practise diaphragmatic breathing: place one hand on your abdomen — when you inhale, your abdomen should expand outward (not your shoulders rising). Do 3 deep belly breaths every 30 minutes to reset your breathing pattern.',
        checkpoint: 'Notice your breathing state when a vibration alert occurs. Rapid, shallow breathing typically co-occurs with poor posture.',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-005',
        title: 'Set a Posture Goal for Today',
        why: 'Goal-directed training outperforms aimless training by 43% (according to performance psychology research). Specific, measurable goals are the core driver of improvement.',
        action: 'Before starting today\'s session, set one specific goal, for example:\n• "Green-zone time above 75%"\n• "3 fewer vibrations than last time"\n• "Second half better than first half"\nPick one and write it down.',
        checkpoint: 'Review after your session: did you achieve your goal? If not, identify one specific movement you can improve.',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-006',
        title: 'Hydration and Muscle Function',
        why: 'Mild dehydration (losing just 2% of body weight in fluids) reduces muscle function by 10–20%, directly impairing your ability to maintain good posture. Many people are mildly dehydrated throughout the working day.',
        action: 'Place a 500 ml bottle of water at your workstation and aim to finish it within 2 hours of work. Avoid caffeinated drinks (which have a diuretic effect) — tea and plain water are the best choices.',
        checkpoint: 'Did you drink at least 1.5 litres of water today? Note it down and build a habit of regular hydration.',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-007',
        title: 'Visual Height and Cervical Health',
        why: 'Every 15° the gaze tilts downward increases the load on the cervical spine by approximately 12 kg. Prolonged head-down work is the primary risk factor for cervical spondylosis.',
        action: 'Check the height of your main working surface. Screens or work materials should sit 15–20° below eye level so the neck stays close to neutral. Consider using a stand or tool holder to adjust the height.',
        checkpoint: 'Did you experience persistent neck tension today? Did changing the height of your work materials provide any relief?',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-008',
        title: 'Foot Support and Postural Stability',
        why: 'Unstable foot support causes anterior pelvic tilt, which triggers excessive lumbar lordosis — an upstream cause of trunk forward lean. Stable ground contact is the foundation of good whole-body posture.',
        action: 'Check your working position: both feet should rest flat on the floor (seated) or on an anti-fatigue mat (standing). When seated, knees should be bent at about 90° with feet not dangling. When standing, consider using an anti-fatigue mat.',
        checkpoint: 'Experiment with standing on an anti-fatigue mat today (if available) or using a footrest. Does your lumbar comfort improve?',
        tags: ['general'],
        triggerRule: null
    },
    {
        id: 'general-009',
        title: 'Rapid Recovery Technique',
        why: 'Vibration alerts are warning signals, but what matters most is how quickly you return from poor posture to good posture. A shorter average recovery time reflects stronger posture awareness.',
        action: 'Practise the "3-second recovery protocol" today: vibration received → immediately stop movement → spend 3 seconds consciously adjusting to a green-zone posture → resume work. Aim for a recovery time under 5 seconds every time.',
        checkpoint: 'What was your average recovery time today? Is it better than last session? A recovery time over 10 seconds indicates a need for more posture awareness practice.',
        tags: ['general'],
        triggerRule: 'lastSession && parseFloat(lastSession.avgRecoveryTime) > 10'
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

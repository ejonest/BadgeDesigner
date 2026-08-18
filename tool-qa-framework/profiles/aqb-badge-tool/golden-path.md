# The Golden Path — Ideal Customer Journey

**What this document is:** a definition of the *ideal* minimal path a
customer should be able to take to place a common order, checked
against what the tool currently requires. Written to sit alongside the
automated test suite — the persona tests in `tests/aqb-badge-tool.personas.spec.js`
exercise real human behavior against this same ideal.

## The order used as the reference case

*N badges, each with Name + Title (2 lines), magnetic backing.*

## Golden path — same shape/style across all N badges

1. Land on the product page → tool opens directly at "Pick a Shape."
   No dead space above it (see Issue 18).
2. Pick shape — once.
3. Pick color/style — once.
4. Icon step: nothing to tap. "No icon" is the default (see Issue 17) —
   the customer only interacts with this step if they actively want an
   icon.
5. Text step: switch to bulk mode, paste `Name,Title` for all N badges
   in one paste.
6. Backing: pick Magnetic — once, applied to the whole batch.
7. Review proof (all N badges shown at once) → Confirm and Add to Cart.
8. Checkout.

**That's 6 decisions, regardless of whether N is 2 or 50.** This is the
benchmark the tool should be measured against — the "Efficient Emma"
persona test exercises exactly this path.

This is the order shape that matters most: most customers order one
badge style/shape per order (a team, a department, an event), not a
mix of different shapes in a single order. The bulk CSV path already
serves this well — varying Name and Title per row while everything
else (shape, color, icon, backing) is set once for the whole batch.

## How this connects to the automated tests

| Golden path step | Covered by |
|---|---|
| Steps 1–4 friction (labels, icon default, scroll) | Issues 16, 17, 18 (Round 3 findings) |
| Step 5 bulk text entry | `scenario-blue-bulk10-white-magnetic` and other named scenarios |
| Real human behavior around this path (mistakes, backtracking, interruptions) | `tests/aqb-badge-tool.personas.spec.js` |

## The customer personas, and what each one is really checking

| Persona | Simulates | What it's really testing |
|---|---|---|
| Efficient Emma | The golden path, zero mistakes | Whether the *ideal* path is actually as smooth as it should be |
| Clumsy Carl | Changing an earlier choice (background color) after later steps are already filled in | Stale state — does correcting something early properly update everything downstream, or does old data linger? |
| Backtracking Betty | Reaching the proof step, going back to edit, re-confirming | Directly probes the Issue 15 risk: does the FINAL edited version reach the cart, or can an edit get silently dropped in that transition? |
| Interrupted Ian | Closing the tab mid-design, and separately mid-cart, then reopening later | Documents actual behavior (not an assumed pass/fail) for a very common real pattern — someone starts an order, gets pulled away, comes back later |
| Returning Rachel | Pays for an order as a guest, closes the tab, comes back days later wanting to check or reorder | Whether a guest (no account) customer has any real path back to her order — a repeat-business question, not just a UX one |

Persona tests are intentionally **behavioral**, not combinatorial —
they're a different lens than the pairwise/scenario suites, and both
are needed. Pairwise finds "these two options break together." Personas
find "a real person doing something reasonable but imperfect breaks the
tool."

## Journey narratives — the most likely step-by-step path for each persona

These are the concrete, moment-by-moment paths each persona is most
likely to actually take, written out to make the "why" behind each
test obvious at a glance. Each one flags where the real risk point
sits — not just that a persona exists, but *where in their journey*
something is most likely to go wrong.

### 1. Efficient Emma — the golden path

1. Lands on the badge designer, "Pick a Shape" already in view
2. Taps a shape once, taps a color once
3. Sees the icon step, doesn't want one, moves straight past it (relies
   on "No" being the default — Issue 17)
4. Opens "Add Your Text," switches to bulk mode, pastes 10 rows of
   Name,Title in one paste
5. Picks "Magnetic" for backing
6. Reviews the proof (all 10 badges shown), ticks the confirmation box,
   taps Confirm and Add to Cart
7. Goes to cart, taps Checkout, completes payment

**Total friction points: zero, ideally.** This is the benchmark — if
even Emma hits a snag, it's a tool problem, not a "confused customer"
problem.

### 2. Clumsy Carl — corrects himself mid-flow

1. Picks a shape, picks white background (his first instinct)
2. Picks the cross icon
3. Types his name and title
4. Looks at the preview, decides he actually wants it on black — goes
   back and changes the background *after* the icon and text are
   already set
5. Glances at the preview again to confirm the icon didn't vanish
   (this is exactly the black-background contrast bug found in manual
   testing — Carl might not even consciously notice, he'd just feel
   like "something looks off" and either fix it or give up)
6. Picks a backing, reviews the proof
7. Adds to cart

**Most realistic risk point:** step 5 — if the icon disappears and
Carl doesn't catch it, he could order a badge with an invisible icon
and only find out when it arrives, or get frustrated at a preview that
"looks wrong" without understanding why and abandon.

### 3. Backtracking Betty — catches a mistake late

1. Completes a full design efficiently, same as Emma
2. Gets to "Review your proof," actually reads it carefully (unlike
   Emma, who might just tick and go)
3. Spots a typo or wrong title
4. Taps "Back to Edit" (or whatever it's currently labeled — see
   Issue 12)
5. Fixes the text
6. Has to re-reach the proof screen and re-confirm
7. Adds to cart

**Most realistic risk point:** steps 6-7 — this is exactly where
Issue 15's flash-to-blank-Step-1 bug lives. Betty's mental model at
this moment is "I fixed my mistake," so if the transition looks like
it wiped her design, that's a genuine trust-breaking moment, not just
a visual glitch.

### 4. Interrupted Ian — walks away mid-design

1. Starts a design on his phone during a work break — picks a shape, a
   color, starts typing a name
2. Gets pulled into a meeting, closes the browser tab without
   finishing
3. Comes back that evening, opens the site again
4. Outcome is genuinely unpredictable without checking — either the
   tool remembers nothing and Ian starts over (mildly annoying but not
   broken), or it partially restores his progress (nice, but only good
   if it's *correct*, not a stale mix)

**Most realistic behavior:** most people in this situation don't
remember exactly what they picked before — so if the tool starts
fresh, most Ians shrug and redo it in under a minute. If it "remembers"
but gets it subtly wrong, that's worse than remembering nothing, since
Ian might not double check and order something he didn't mean to.

### 5. Returning Rachel — needs her order after she's already paid

1. Completes an order and pays, same as Emma
2. Closes the tab
3. A week later, wants to check her order status or reorder the same
   badge for a new hire
4. Comes back to the site — this is where "Sign in on the storefront
   to save and reorder in one click" (a line already visible in the
   tool) either pays off, or Rachel realizes she never created an
   account and has no easy way to find her past order

**Most realistic risk point:** step 4 — if Rachel didn't sign in
originally, this is a real drop-off point for repeat business. Worth
checking whether the tool actively encourages account creation
*before* checkout (when there's a concrete incentive — "save this
design") rather than treating it as an afterthought.

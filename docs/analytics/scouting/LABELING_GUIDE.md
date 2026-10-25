# Labeling guide (annotations, vocabulary v1)

How to annotate footage in Courtside Research so that the result can be cited, reviewed and, later,
counted. The protocol is VIDEO_PIPELINE §7, the vocabulary §8, the sampling rules §9; this guide
turns them into instructions for the person doing the labeling.

## 1. What an annotation is

One **observable action** by one subject within one segment of one authorised asset, over a short
time window, with an outcome you saw on screen. It is stored with a mandatory `sampling_method`,
a `visibility` and an identity status, and every save appends a revision. Nothing is ever
overwritten or physically deleted.

An annotation is **not**: a judgment ("good closeout"), a tactical reading ("ice coverage"), or
a statistic. Judgments live only in report claims of class `interpretation`; tactical readings are
a separate `interpretation` annotation kind that cites the observation (not yet implemented).

## 2. Before you start

1. The asset must be a managed upload whose permission statement allows viewing. External
   references (nba.com clips) cannot be annotated: nothing is downloaded, so there is no timeline.
2. The segment you annotate inside must exist and be classified (`live`, `replay`, `unknown`,
   `non_game`). Annotate replays only when the live view did not show the action, and say so in
   the notes.
3. Pick the subject from the game roster (`GET /api/games/{game_id}/roster`, both teams from
   `player_game_logs`). Demo players and real players never mix: the API refuses a demo id in the
   `nba` namespace and a provider id in `demo`.

## 3. Rules

| Rule | Why |
| --- | --- |
| **One primary action per annotation.** A drive that ends in a kick-out is one `drive` with outcome `kick_out`; the shooter's `catch_and_shoot_3` is a second annotation. | Counting needs one row per opportunity. |
| **Label what you see, not what you infer.** If you cannot see the contact on a screen, the outcome is `not_observable`, not `defender_contact`. | Inference belongs in interpretation, not observation. |
| **Identity before `verified`.** Mark `verified` only when you identified the player visually (number, build, position on the floor plus the play-by-play). `asserted` means "the play-by-play says so, I could not confirm". `unknown` means no `subject_player_id` at all. The system refuses a player id with `unknown` and refuses `verified`/`asserted` without one. | DEC-10: identity is a reviewable assignment, never assumed. |
| **Use `unknown` and `not_observable` liberally.** They are valid labels and are counted as coverage gaps, which is honest. Guessing is not. | Rates are only as good as their denominators. |
| **Always record visibility**: `full`, `partial`, `obstructed` or `off_frame`. | Model training and review both filter on it. |
| **Window inside the segment**, roughly one second before the action to one second after the outcome. Add `supporting_timestamps` for the frames that justify the label (release, contact, catch). | Reviewers jump straight to the evidence. |
| **Outcome from the vocabulary only.** The API refuses pairs the vocabulary does not list. If none fits, use the closest observable outcome and explain in the notes; propose a vocabulary change in DECISIONS rather than bending a label. | Versioned vocabulary keeps old labels comparable. |
| **Notes are free text and untrusted.** Write what helps a reviewer. The notes are returned under `notes.content` with a trust marker and are never read by the copilot as instructions. | D-05 injection defence. |

## 4. Sampling method (mandatory)

Choose it before labeling a session, not per clip, and keep it constant within a session:

| Method | Use when | Supports |
| --- | --- | --- |
| `complete_event_set` | you label every provider event of a type (e.g. every catch-and-shoot 3 by the subject) in the covered games | rates per opportunity within covered games, with a coverage figure |
| `systematic_sample` | every k-th possession or event in the covered games | estimates with sampling error |
| `random_sample` | a random draw of events/possessions | estimates with sampling error |
| `curated` | you picked clips to illustrate something | examples only, never a rate |
| `provider_selected` | the provider's clip set chose the events (highlights, player clips) | examples only, never a rate |

The trait layer refuses to compute a rate from `curated` or `provider_selected` labels and from any
set without an opportunity denominator (PROFILES_AND_RANKING §4).

## 5. Vocabulary v1 quick reference

| Action | Label when | Outcomes |
| --- | --- | --- |
| `catch_and_shoot_3` | shoots a 3 off the catch, no dribble | `made`, `missed`, `blocked`, `fouled` |
| `pull_up_shot` | shoots after one or more dribbles | same |
| `drive` | attacks off the dribble past the first defender's hip | `finish_made`, `finish_missed`, `kick_out`, `turnover`, `foul_drawn` |
| `screen_set` | sets a stationary screen | `defender_contact`, `slipped`, `switched`, `not_observable` |
| `cut` | off-ball move to the rim or an open area to receive | `received`, `not_received` |
| `closeout` | defender runs at a shooter after a pass | `contest_hand_up`, `late`, `blown_by`, `no_shot` |
| `help_rotation` | defender leaves their assignment to help | `stop`, `late`, `not_observable` |
| `box_out` | makes contact to prevent a rebound | `secured_team`, `lost` |
| `post_up` | establishes position back to the basket | `score`, `miss`, `pass_out`, `turnover` |
| `pass_creation` | pass that leads directly to a shot attempt | `assist`, `shot_missed`, `secondary` |
| `turnover_live` | loses the ball to the defense | `steal`, `deflection` |
| `unknown` | the action could not be determined | none |
| `not_observable` | the player or action is out of frame / obstructed | none |

Edge cases:

- A shot fake into a drive: `drive`, with the fake in the notes.
- Closeout to a player who does not shoot: `closeout` with `no_shot`.
- Screen where the defender switches before contact: `switched`.
- Two players box out the same opponent: one annotation per boxer-out.
- Broadcast cuts away mid-action: `visibility = off_frame` and outcome `not_observable` where the vocabulary allows it, otherwise `unknown`.

## 6. Review

Review is a separate action (`POST /api/annotations/{id}/review`) and a separate revision.
`reviewed_ok` confirms the label; `reviewed_corrected` means the reviewer changed something (make
the change first with a `PATCH`, then review, so the diff and the verdict are both in the history);
`rejected` means the clip should not be used. Disagreements stay in the revision history and
surface in profiles as counterevidence; do not delete to resolve a disagreement.

## 7. Deleting

`DELETE /api/annotations/{id}` sets `deleted_at` and appends a revision with the reason. The row and
its history remain, and any evidence item or report claim that cited it is marked instead of
losing its target (B-08). Prefer `rejected` over deletion unless the annotation was created by
mistake (wrong segment, duplicate).

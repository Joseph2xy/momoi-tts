# UX exploration

Three whole-app directions on `/prototype.html?variant=A|B|C`. This isolated entrypoint allows exploration of navigation and management as well as Activity without initializing playback, reading private configuration, or calling providers. All data and actions are simulated in memory. It is excluded from production build inputs. No direction is accepted yet.

Run `npm run prototype:ux`, then open http://127.0.0.1:3224/prototype.html.

## Design plan

The subject is a mostly unattended streaming utility: named viewer questions become character replies and sequential speech. The design should make intervention fast and state understandable. It should not become a chat application, analytics dashboard, or character marketplace.

| Direction        | Palette                                                                                      | Typography                                               | Structure and principle                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Studio desk   | Canvas #202025, surface #29292f, text #f5f4f6, muted #b0adb8, coral #f49b8b, success #a8d6bd | Local Outfit; medium-weight headings and restrained body | Left navigation; current question and controls beside waiting questions; quiet history below. A compact broadcast desk with persistent operational context.                        |
| B: Focus view    | Canvas #24242a, stage #2e2e35, text #f5f4f6, muted #b4b1bd, lilac #c5b6f6, coral #f49b8b     | Local Outfit; large question, quiet reply                | Horizontal navigation; centered question with controls immediately beneath; waiting questions at the edge; history behind disclosure. Spend visual emphasis on the question alone. |
| C: Operator view | Canvas #edf0f5, surface #ffffff, text #282a36, muted #646777, violet #6652aa, coral #a74437  | Local Outfit; compact hierarchy, tabular times           | Horizontal navigation; current work above a unified activity table; pinned playback dock. A daylight alternative for scanning state rather than reading a stage.                   |

Wireframes:

```text
A: [nav | current question + controls | up next]
        [recent activity                       ]
B: [quiet top navigation                       ]
        [large current question       | next   ]
        [reply and playback controls  |        ]
        [expand recent activity                ]
C: [top navigation                 status      ]
   [current question                 skip      ]
   [state | viewer | question | time | action   ]
   [persistent playback dock                   ]
```

Review against the brief: a broadcast utility needs a question and reliable controls, not decorative metrics or animated sound meters. Removed analytics, invented character art, live Twitch indicators, and faux waveforms from the plan. A preserves the charcoal/coral spirit; B changes the amount of attention demanded; C tests a distinctly different density and light environment. Shared controls retain meaning across all three.

Proposed UX changes for comparison: preparation organized around the character, response, playback, and stream connection; Soundcheck accessible in the workspace; browser personality editing with a draft/save flow; readiness summarized in a compact expandable surface; history searchable or collapsed by direction. These are proposals, not implemented backend features or changes to provider access, Twitch integration, or queue policy. Existing screens, labels, and file-based editing are not requirements for the eventual redesign.

The preview toolbar reports its simulated state and can reset it, switch busy/empty/failed examples, and compare variants. It is prototype chrome, separate from each design.

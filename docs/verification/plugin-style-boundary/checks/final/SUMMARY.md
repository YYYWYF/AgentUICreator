# Final retained-source checks

- React build/typecheck: PASS (rollback-build / retained-typecheck).
- i18n / upstream purity: PASS (retained-i18n / retained-upstream).
- Focused unit suite: 10 files / 54 tests PASS.
- Baseline integration-boundary and theme-bridge tests: reproduced failures in current and f66 snapshot; not a green complete unit suite.
- Manual browser matrix: 10 PASS / 20 FAIL; AntD basic 8 PASS; A/C basic 16 FAIL; B boundary 2 PASS; A/C boundary 4 FAIL.
- Actual Plugin Runtime AntD native comparison: 8 PASS.
- Retained official P0 browser subset: 44 PASS.
- Retained Sidebar/owned control/rename/Portal subset: 8 PASS; normalized DS probes are not A/C acceptance.
- Embedded browser: 6 PASS, tested on the CSS-identical retained baseline (no change to embedded fixture or styling).
- Rebuilt Shadow DOM browser: 10 PASS. First rebuild network timeout preserved; retry successful.
- Restored A/B/C Host verify/typecheck/build: all nine checks PASS; real Creator Plugin browser A/C 8 PASS each, B desktop 4 PASS / narrow 4 FAIL.
- Full official candidate-era runs: 114/120 and 118/120, retained red; config-transition rerun 12 PASS.
- Root-leading CSS candidate: WITHDRAWN, 48 official geometry deltas; final CSS equals f66c4129.

`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED`

Log formatting removes trailing spaces and blank EOF lines only; outcomes and error text are preserved.

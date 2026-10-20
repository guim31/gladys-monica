// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
//   - `read_week_birthdays`: the birthdays of today and the six days after
//     it, as a sentence for a message or a voice announcement (a Monday
//     morning scene), and their number, to gate the next actions.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async read_week_birthdays(hub) {
    return hub.week();
  },
};

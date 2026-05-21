| ID    | Feature            | Setup                          | Trigger            | Expected Live Behaviour            | Observed Behaviour | Status    |
| ----- | ------------------ | ------------------------------ | ------------------ | ---------------------------------- | ------------------ | --------- |
| RT-01 | Persistent members | Account A room open, B outside | B joins room       | A sees B in roster without refresh |                    | Pass/Fail |
| RT-02 | Persistent members | A and B in room                | B leaves           | A roster removes B live            |                    | Pass/Fail |
| RT-03 | Presence           | A in room                      | B enters same room | A online count increases           |                    | Pass/Fail |
| RT-04 | Presence           | A and B online                 | B changes status   | A sees updated status              |                    | Pass/Fail |
| RT-05 | Presence           | A and B online                 | B leaves room      | A online count decreases           |                    | Pass/Fail |
| RT-06 | Chat               | A and B in room                | A sends message    | B receives instantly               |                    | Pass/Fail |
| RT-07 | Chat persistence   | Chat messages exist            | Refresh room       | Message history preserved          |                    | Pass/Fail |
| RT-08 | Voice              | A and B in same room           | Both join voice    | Both see voice participants        |                    | Pass/Fail |
| RT-09 | Voice              | A and B in voice               | A speaks           | B hears audio                      |                    | Pass/Fail |
| RT-10 | Voice              | A and B in voice               | A leaves voice     | B sees participant count decrease  |                    | Pass/Fail |

extends Node
## Input actions runtime pe banate hain, project.godot mein nahi.
##
## Godot ka ConfigFile input actions ko ek lambe `Object(InputEventKey, ...)`
## serialisation mein likhta hai jisme har property honi chahiye. Use haath se
## likhna bhangur hai (aur version ke saath badalta hai), isliye InputMap API se
## banate hain -- padhne mein saaf, aur har Godot 4.x pe chalta hai.

const ACTIONS := {
	"move_forward": [KEY_W, KEY_UP],
	"move_back": [KEY_S, KEY_DOWN],
	"move_left": [KEY_A, KEY_LEFT],
	"move_right": [KEY_D, KEY_RIGHT],
	"sprint": [KEY_SHIFT],
	"jump": [KEY_SPACE],
	"handbrake": [KEY_SPACE],
	"enter_vehicle": [KEY_F],
	"interact": [KEY_E],
	"cycle_weather": [KEY_2],
	"quick_save": [KEY_P],
}


func _ready() -> void:
	for action: String in ACTIONS:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		for key: int in ACTIONS[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = key
			InputMap.action_add_event(action, ev)

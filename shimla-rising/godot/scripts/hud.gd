extends CanvasLayer
## HUD: sitare, paisa, mission list, speedo, subtitle.

@onready var stars_label: Label = $Root/TopLeft/Stars
@onready var money_label: Label = $Root/TopLeft/Money
@onready var district_label: Label = $Root/TopLeft/District
@onready var mission_title: Label = $Root/Mission/Title
@onready var objectives: Label = $Root/Mission/Objectives
@onready var speed_label: Label = $Root/Speedo/Kmh
@onready var vehicle_label: Label = $Root/Speedo/VehicleName
@onready var subtitle: Label = $Root/Subtitle


func set_stars(n: int) -> void:
	stars_label.text = "★".repeat(n) + "☆".repeat(5 - n)


func set_money(v: int) -> void:
	money_label.text = "₹%s" % _indian_format(v)


func set_district(name: String) -> void:
	district_label.text = name


func set_speed(kmh: float, label: String) -> void:
	speed_label.text = "%d km/h" % roundi(kmh)
	vehicle_label.text = label


func set_mission(m: Dictionary, obj_index: int, extra: String = "") -> void:
	if m.is_empty():
		mission_title.text = ""
		objectives.text = ""
		return
	mission_title.text = m["title"]
	var lines: PackedStringArray = []
	var objs: Array = m["objectives"]
	for i in objs.size():
		var mark := "✓" if i < obj_index else ("▸" if i == obj_index else "·")
		var suffix := (" " + extra) if (i == obj_index and not extra.is_empty()) else ""
		lines.append("%s %s%s" % [mark, objs[i]["text"], suffix])
	objectives.text = "\n".join(lines)


func say(speaker_name: String, text: String) -> void:
	subtitle.text = "%s: %s" % [speaker_name, text]
	subtitle.visible = true


func clear_subtitle() -> void:
	subtitle.visible = false


## Indian digit grouping: 12,34,567 (western 1,234,567 nahi).
func _indian_format(v: int) -> String:
	var s := str(absi(v))
	if s.length() <= 3:
		return ("-" if v < 0 else "") + s
	var head := s.substr(0, s.length() - 3)
	var tail := s.substr(s.length() - 3)
	var parts: PackedStringArray = []
	while head.length() > 2:
		parts.push_front(head.substr(head.length() - 2))
		head = head.substr(0, head.length() - 2)
	if not head.is_empty():
		parts.push_front(head)
	parts.append(tail)
	return ("-" if v < 0 else "") + ",".join(parts)

# How the Low Synergy score is calculated

The Low Synergy score estimates how reasonable it is to cut a card because it is poorly supported by the current deck. A larger number means more cut pressure. It is not a general card-power rating.

## 1. Base cut pressure

```text
base pressure = theme mismatch × 30% + role surplus × 70%
```

Theme mismatch asks whether the card participates in supported deck engines. Incidental abilities such as Ward or Trample do not create a penalty when the deck does not support them.

Role surplus asks whether the deck already exceeds the target range for jobs such as lands, ramp, draw, removal, protection, recursion, tutors, and board wipes. Relevant role quality can soften surplus pressure but never creates extra virtual card slots.

## 2. Engine balance

Engine membership comes from structured card effects and background event signals. Related wording such as “sacrifice,” “dies,” and “leaves the battlefield” can therefore connect inside one engine without appearing as several independent protections.

```text
enabler balance = min(1, payoff units × desired ratio ÷ enabler units)
payoff balance  = min(1, enabler units ÷ (payoff units × desired ratio))
```

Supply uses weighted effect units rather than raw card count. Quantity, conditional availability, repeatability, multiple uses per turn, and multiplayer scaling affect those units. A commander directly participating in an engine contributes persistent commander-backed supply inside that engine; the same evidence is not counted again as indirect commander protection.

For a card participating in several engines, the strongest engine contributes 100%, the second 25%, and the third 10%. Further engines do not add protection.

## 3. Efficiency

Standalone efficiency compares the best qualifying role or theme effect with peer cards sharing that function:

```text
card efficiency = effect modifier ÷ mana value
peer efficiency = average peer effect modifier ÷ peer mana value
efficiency advantage = clamp(card efficiency ÷ peer efficiency − 1, 0, 1)
```

The standalone efficiency protection is the advantage multiplied by 15%. A comparison requires at least one peer. Lands are excluded from this standalone comparison.

Engine-side efficiency is separate:

```text
engine efficiency = clamp(card-side quality ÷ average comparable-side quality, 0.25, 1)
```

It can reduce the engine protection of a weaker surplus piece but cannot raise engine protection above 100%.

## 4. Percentage protections

- Engine protection: up to 25%
- Standalone efficiency protection: up to 15%
- Indirect commander protection: up to 30%
- Combined protection: capped at 50%

Indirect commander protection covers a distinct commander interaction, such as protecting the commander. Direct commander participation in a theme engine is already included in engine balance.

Protections combine multiplicatively:

```text
uncapped protection
  = 1 − (1 − engine protection)
        × (1 − efficiency protection)
        × (1 − indirect commander protection)

combined protection = min(50%, uncapped protection)
final Low Synergy = base pressure × (1 − combined protection)
```

Protections affect only Low Synergy. They do not reduce Curve, Price, or Low Popularity.

## 5. Overall cut score

Without a budget:

```text
Overall = Curve × 50% + Low Synergy × 37.5% + Low Popularity × 12.5%
```

With a budget enabled:

```text
Overall = Curve × 40% + Low Synergy × 30% + Price × 20% + Low Popularity × 10%
```

The interface displays these normalized values on a 0–100 scale.

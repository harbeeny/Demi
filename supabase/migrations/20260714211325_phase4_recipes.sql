-- Phase 4: recipes and grocery data.
-- Part 1: recipe columns. Part 2: ten new meals adapted from USDA MyPlate
-- Kitchen (public domain; instructions are original prose). Part 3: recipe
-- backfill for the whole catalog, generated from src/lib/plan/recipes.seed.ts.

alter table public.meals
  add column if not exists ingredients  jsonb   not null default '[]'::jsonb,
  add column if not exists instructions text[]  not null default '{}',
  add column if not exists prep_min     integer not null default 0,
  add column if not exists cook_min     integer not null default 0;

insert into public.meals (name, kcal, protein_g, carbs_g, fat_g, fiber_g, tags, source) values
  ('Garden veggie frittata', 360, 24, 8, 26, 2, '{breakfast,vegetarian,basic,low,high_protein,low_carb,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/garden-frittata'),
  ('Avocado melon breakfast smoothie', 330, 15, 34, 14, 5, '{breakfast,vegetarian,minimal,low,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/avocado-melon-breakfast-smoothie'),
  ('Banana oat lentil pancakes', 450, 20, 68, 10, 9, '{breakfast,vegetarian,basic,low,high_fiber}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/banana-oatmeal-pancakes-lentils'),
  ('Lentil tacos with corn tortillas', 480, 18, 76, 12, 12, '{dinner,vegan,vegetarian,basic,low,high_fiber,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/supplemental-nutrition-assistance-program-snap/lentil-tacos'),
  ('One pan taco rice with turkey', 550, 33, 58, 21, 4, '{dinner,basic,low,high_protein,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/one-pan-taco-rice'),
  ('Stuffed bell peppers with beef and rice', 480, 31, 42, 21, 6, '{dinner,basic,low,high_protein,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/supplemental-nutrition-assistance-program-snap/stuffed-bell-peppers'),
  ('Red beans and rice', 510, 15, 76, 15, 13, '{dinner,vegan,vegetarian,basic,low,high_fiber,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/myplate-cnpp/red-beans-and-rice'),
  ('Skillet lasagna with zucchini', 540, 40, 52, 20, 6, '{dinner,basic,low,high_protein}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/quick-skillet-lasagna'),
  ('Crispy roasted chickpeas', 260, 11, 30, 10, 9, '{snack,vegan,vegetarian,basic,low,high_fiber,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/supplemental-nutrition-assistance-program-snap/roasted-chickpeas-garbanzo-beans'),
  ('Black bean dip with veggie sticks', 220, 13, 26, 7, 8, '{snack,vegetarian,minimal,low,high_fiber,gluten_free}', 'USDA MyPlate Kitchen, adapted: https://www.myplate.gov/recipes/supplemental-nutrition-assistance-program-snap/layered-black-bean-dip');

update public.meals set
  ingredients  = '[{"item":"greek yogurt","qty":170,"unit":"g","aisle":"dairy & eggs"},{"item":"mixed berries","qty":125,"unit":"g","aisle":"produce"},{"item":"honey","qty":3,"unit":"tsp","aisle":"pantry"},{"item":"almonds","qty":15,"unit":"g","aisle":"pantry"}]'::jsonb,
  instructions = array['Spoon the yogurt into a bowl.', 'Rinse the berries and scatter them over the top.', 'Drizzle with honey, then finish with the almonds for crunch.'],
  prep_min = 5,
  cook_min = 0
where name = 'Greek yogurt with berries and honey';

update public.meals set
  ingredients  = '[{"item":"rolled oats","qty":50,"unit":"g","aisle":"grains & bread"},{"item":"peanut butter","qty":1.5,"unit":"tbsp","aisle":"pantry"},{"item":"banana","qty":1,"unit":"count","aisle":"produce"},{"item":"ground cinnamon","qty":0.25,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Simmer the oats in water or milk of your choice with a pinch of salt until creamy, about 5 minutes.', 'Stir in the peanut butter off the heat so it melts through.', 'Slice the banana over the top and dust with cinnamon.'],
  prep_min = 3,
  cook_min = 5
where name = 'Oatmeal with peanut butter and banana';

update public.meals set
  ingredients  = '[{"item":"egg","qty":3,"unit":"count","aisle":"dairy & eggs"},{"item":"whole wheat bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"butter","qty":0.5,"unit":"tbsp","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Whisk the eggs with a pinch of salt until fully blended.', 'Toast the bread while you melt the butter in a nonstick pan over medium-low heat.', 'Pour in the eggs and stir gently until just set, then pile onto the toast and season with pepper.'],
  prep_min = 3,
  cook_min = 5
where name = 'Scrambled eggs on whole-wheat toast';

update public.meals set
  ingredients  = '[{"item":"whey protein powder","qty":25,"unit":"g","aisle":"pantry"},{"item":"banana","qty":1,"unit":"count","aisle":"produce"},{"item":"rolled oats","qty":30,"unit":"g","aisle":"grains & bread"},{"item":"milk","qty":150,"unit":"ml","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Break the banana into a blender and add the oats, protein powder, and milk.', 'Add a handful of ice and blend on high until completely smooth.', 'Pour into a tall glass and drink right away.'],
  prep_min = 5,
  cook_min = 0
where name = 'Protein smoothie (whey, banana, oats, milk)';

update public.meals set
  ingredients  = '[{"item":"egg","qty":3,"unit":"count","aisle":"dairy & eggs"},{"item":"feta cheese","qty":30,"unit":"g","aisle":"dairy & eggs"},{"item":"baby spinach","qty":1,"unit":"cup","aisle":"produce"},{"item":"bell pepper","qty":40,"unit":"g","aisle":"produce"},{"item":"onion","qty":20,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Dice the pepper and onion, then soften them in the oil over medium heat for 3 minutes.', 'Add the spinach and let it wilt, then spread the vegetables evenly in the pan.', 'Pour in the whisked eggs, cook until nearly set, and crumble the feta over one half.', 'Fold the omelette over the cheese, season with salt and pepper, and slide onto a plate.'],
  prep_min = 8,
  cook_min = 8
where name = 'Veggie omelette with feta';

update public.meals set
  ingredients  = '[{"item":"cottage cheese","qty":250,"unit":"g","aisle":"dairy & eggs"},{"item":"pineapple","qty":120,"unit":"g","aisle":"produce"},{"item":"honey","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Spoon the cottage cheese into a bowl.', 'Cut the pineapple into bite-size chunks and arrange on top.', 'Finish with a thin drizzle of honey.'],
  prep_min = 5,
  cook_min = 0
where name = 'Cottage cheese bowl with pineapple';

update public.meals set
  ingredients  = '[{"item":"tofu","qty":150,"unit":"g","aisle":"produce"},{"item":"baby spinach","qty":2,"unit":"cup","aisle":"produce"},{"item":"whole wheat bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"smoked paprika","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Heat the oil in a skillet and soften the diced onion for 2 minutes.', 'Crumble the tofu into the pan, sprinkle with paprika and salt, and cook 4 minutes, stirring often.', 'Fold in the spinach and cook until just wilted.', 'Toast the bread and serve the scramble over or alongside it.'],
  prep_min = 5,
  cook_min = 8
where name = 'Tofu scramble with spinach and toast';

update public.meals set
  ingredients  = '[{"item":"rolled oats","qty":50,"unit":"g","aisle":"grains & bread"},{"item":"chia seeds","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"almond butter","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"soy milk","qty":150,"unit":"ml","aisle":"dairy & eggs"},{"item":"maple syrup","qty":1,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Stir the oats, chia seeds, and soy milk together in a jar with a pinch of salt.', 'Swirl in the maple syrup, cover, and refrigerate overnight or at least 4 hours.', 'In the morning, loosen with a splash of water if thick and top with the almond butter.'],
  prep_min = 8,
  cook_min = 0
where name = 'Overnight oats with chia and almond butter';

update public.meals set
  ingredients  = '[{"item":"egg","qty":2,"unit":"count","aisle":"dairy & eggs"},{"item":"black beans","qty":80,"unit":"g","aisle":"pantry"},{"item":"flour tortilla","qty":1,"unit":"count","aisle":"grains & bread"},{"item":"salsa","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"cheddar cheese","qty":20,"unit":"g","aisle":"dairy & eggs"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Warm the drained beans in a small pan and lightly mash a few of them.', 'Scramble the eggs with a pinch of salt over medium-low heat until just set.', 'Warm the tortilla, then layer on eggs, beans, cheese, salsa, and sliced avocado.', 'Fold in the sides and roll tightly, then halve to serve.'],
  prep_min = 8,
  cook_min = 8
where name = 'Breakfast burrito (eggs, black beans, salsa)';

update public.meals set
  ingredients  = '[{"item":"bagel","qty":1,"unit":"count","aisle":"grains & bread"},{"item":"smoked salmon","qty":80,"unit":"g","aisle":"meat & seafood"},{"item":"cream cheese","qty":1.5,"unit":"tbsp","aisle":"dairy & eggs"},{"item":"onion","qty":15,"unit":"g","aisle":"produce"},{"item":"cucumber","qty":30,"unit":"g","aisle":"produce"}]'::jsonb,
  instructions = array['Split and toast the bagel until golden.', 'Spread both halves with the cream cheese.', 'Layer on the smoked salmon, thin cucumber slices, and slivered onion, then grind pepper over the top.'],
  prep_min = 5,
  cook_min = 3
where name = 'Smoked salmon bagel with cream cheese';

update public.meals set
  ingredients  = '[{"item":"chicken breast","qty":150,"unit":"g","aisle":"meat & seafood"},{"item":"mixed greens","qty":3,"unit":"cup","aisle":"produce"},{"item":"cherry tomatoes","qty":80,"unit":"g","aisle":"produce"},{"item":"cucumber","qty":60,"unit":"g","aisle":"produce"},{"item":"feta cheese","qty":20,"unit":"g","aisle":"dairy & eggs"},{"item":"olive oil","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"balsamic vinegar","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"dijon mustard","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Season the chicken with salt and pepper and grill or pan-sear 5 to 6 minutes per side until cooked through. Rest 5 minutes, then slice.', 'Whisk the oil, vinegar, and mustard with a pinch of salt into a quick vinaigrette.', 'Toss the greens, halved tomatoes, and sliced cucumber with the dressing.', 'Top with the sliced chicken and crumbled feta.'],
  prep_min = 10,
  cook_min = 12
where name = 'Grilled chicken salad with vinaigrette';

update public.meals set
  ingredients  = '[{"item":"flour tortilla","qty":1,"unit":"count","aisle":"grains & bread"},{"item":"deli turkey","qty":150,"unit":"g","aisle":"meat & seafood"},{"item":"avocado","qty":0.5,"unit":"count","aisle":"produce"},{"item":"mixed greens","qty":1,"unit":"cup","aisle":"produce"},{"item":"tomato","qty":40,"unit":"g","aisle":"produce"},{"item":"mayonnaise","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Spread the mayonnaise across the tortilla.', 'Mash the avocado lightly and spread it over the mayo, then season with salt and pepper.', 'Layer on the turkey, greens, and sliced tomato.', 'Roll tightly, tucking in the ends, and slice in half on the diagonal.'],
  prep_min = 10,
  cook_min = 0
where name = 'Turkey and avocado wrap';

update public.meals set
  ingredients  = '[{"item":"canned tuna","qty":100,"unit":"g","aisle":"pantry"},{"item":"whole wheat bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"mayonnaise","qty":1.5,"unit":"tbsp","aisle":"pantry"},{"item":"onion","qty":15,"unit":"g","aisle":"produce"},{"item":"mixed greens","qty":0.5,"unit":"cup","aisle":"produce"}]'::jsonb,
  instructions = array['Drain the tuna well and flake it into a bowl.', 'Mix in the mayonnaise and finely minced onion, then season with salt and pepper.', 'Pile the tuna salad onto one slice of bread, add the greens, and close with the second slice.'],
  prep_min = 10,
  cook_min = 0
where name = 'Tuna salad sandwich on whole wheat';

update public.meals set
  ingredients  = '[{"item":"chicken breast","qty":100,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"black beans","qty":100,"unit":"g","aisle":"pantry"},{"item":"salsa","qty":3,"unit":"tbsp","aisle":"pantry"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"},{"item":"cheddar cheese","qty":10,"unit":"g","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Cook the rice in salted water according to the package, about 15 minutes.', 'Season the chicken with salt and pepper, sear 5 to 6 minutes per side until cooked through, then rest and dice.', 'Warm the drained beans in a small pan.', 'Build the bowl on the rice with chicken, beans, salsa, sliced avocado, and cheese.'],
  prep_min = 10,
  cook_min = 20
where name = 'Chicken burrito bowl (rice, beans, salsa)';

update public.meals set
  ingredients  = '[{"item":"dried lentils","qty":60,"unit":"g","aisle":"pantry"},{"item":"carrot","qty":50,"unit":"g","aisle":"produce"},{"item":"onion","qty":40,"unit":"g","aisle":"produce"},{"item":"canned diced tomatoes","qty":100,"unit":"g","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"},{"item":"whole wheat bread","qty":1,"unit":"count","aisle":"grains & bread"}]'::jsonb,
  instructions = array['Soften the diced onion and carrot in the oil over medium heat, about 5 minutes, then stir in the minced garlic and cumin.', 'Add the rinsed lentils, tomatoes, and about 2 cups of water. Season with salt.', 'Simmer uncovered 25 to 30 minutes until the lentils are tender, topping up water as needed.', 'Adjust the seasoning and serve with the bread for dipping.'],
  prep_min = 10,
  cook_min = 35
where name = 'Lentil soup with whole-grain bread';

update public.meals set
  ingredients  = '[{"item":"quinoa","qty":50,"unit":"g","aisle":"grains & bread"},{"item":"chickpeas","qty":120,"unit":"g","aisle":"pantry"},{"item":"cucumber","qty":60,"unit":"g","aisle":"produce"},{"item":"cherry tomatoes","qty":60,"unit":"g","aisle":"produce"},{"item":"hummus","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Rinse the quinoa and simmer in salted water for 15 minutes, then drain and fluff.', 'Toss the drained chickpeas with the oil, a squeeze of lemon, salt, and pepper.', 'Dice the cucumber and halve the tomatoes.', 'Spoon everything over the quinoa and crown with the hummus.'],
  prep_min = 10,
  cook_min = 15
where name = 'Chickpea and quinoa power bowl';

update public.meals set
  ingredients  = '[{"item":"chicken breast","qty":140,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":65,"unit":"g","aisle":"grains & bread"},{"item":"frozen peas","qty":60,"unit":"g","aisle":"frozen"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Use precooked rice and cooked chicken from an earlier batch or a rotisserie bird.', 'Warm the oil with the minced garlic in a skillet, then add the diced chicken and rice.', 'Stir in the peas and a splash of water, cover, and heat through, about 5 minutes.', 'Season generously with salt and pepper before serving.'],
  prep_min = 5,
  cook_min = 10
where name = 'Leftover-friendly chicken and rice';

update public.meals set
  ingredients  = '[{"item":"whole wheat bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"mozzarella","qty":50,"unit":"g","aisle":"dairy & eggs"},{"item":"tomato","qty":80,"unit":"g","aisle":"produce"},{"item":"pesto","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"mixed greens","qty":0.5,"unit":"cup","aisle":"produce"},{"item":"balsamic vinegar","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Spread the pesto over both slices of bread.', 'Layer on sliced mozzarella and thick tomato slices, then season with salt and pepper.', 'Add the greens, drizzle with the vinegar, and close the sandwich.'],
  prep_min = 10,
  cook_min = 0
where name = 'Caprese sandwich with pesto';

update public.meals set
  ingredients  = '[{"item":"shrimp","qty":120,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"avocado","qty":0.5,"unit":"count","aisle":"produce"},{"item":"cucumber","qty":50,"unit":"g","aisle":"produce"},{"item":"tamari","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Cook the rice in salted water, about 15 minutes.', 'Pat the shrimp dry, season with salt, and sear in the oil over high heat 1 to 2 minutes per side until pink.', 'Slice the avocado and cucumber.', 'Assemble over the rice and finish with the tamari.'],
  prep_min = 10,
  cook_min = 18
where name = 'Shrimp and avocado rice bowl';

update public.meals set
  ingredients  = '[{"item":"egg","qty":2.5,"unit":"count","aisle":"dairy & eggs"},{"item":"rye bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"mayonnaise","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"dijon mustard","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"mixed greens","qty":1.5,"unit":"cup","aisle":"produce"}]'::jsonb,
  instructions = array['Boil the eggs for 10 minutes, cool in cold water, and peel.', 'Chop the eggs and fold together with the mayonnaise, mustard, salt, and pepper.', 'Spread the egg salad over the rye bread.', 'Serve with the greens on the side, seasoned with a pinch of salt.'],
  prep_min = 10,
  cook_min = 10
where name = 'Egg salad on rye with side salad';

update public.meals set
  ingredients  = '[{"item":"salmon fillet","qty":160,"unit":"g","aisle":"meat & seafood"},{"item":"potato","qty":200,"unit":"g","aisle":"produce"},{"item":"asparagus","qty":100,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Heat the oven to 425 F. Cut the potatoes into wedges, toss with most of the oil, salt, and pepper, and roast 20 minutes.', 'Add the salmon and trimmed asparagus to the pan, brush with the remaining oil, and season.', 'Roast another 12 to 14 minutes until the salmon flakes easily.', 'Squeeze the lemon over everything before serving.'],
  prep_min = 10,
  cook_min = 35
where name = 'Baked salmon, roasted potatoes, asparagus';

update public.meals set
  ingredients  = '[{"item":"chicken breast","qty":140,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"broccoli","qty":80,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":60,"unit":"g","aisle":"produce"},{"item":"carrot","qty":50,"unit":"g","aisle":"produce"},{"item":"tamari","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Start the rice in salted water, about 15 minutes.', 'Slice the chicken thin and cut the vegetables into bite-size pieces.', 'Sear the chicken in the oil over high heat until golden, about 4 minutes, then push aside and stir-fry the vegetables with the garlic for 3 minutes.', 'Add the tamari and a splash of water, toss everything together for 1 minute, and serve over the rice.'],
  prep_min = 15,
  cook_min = 20
where name = 'Chicken stir-fry with vegetables and rice';

update public.meals set
  ingredients  = '[{"item":"ground beef","qty":130,"unit":"g","aisle":"meat & seafood"},{"item":"kidney beans","qty":130,"unit":"g","aisle":"pantry"},{"item":"canned diced tomatoes","qty":150,"unit":"g","aisle":"pantry"},{"item":"onion","qty":50,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":50,"unit":"g","aisle":"produce"},{"item":"chili powder","qty":2,"unit":"tsp","aisle":"pantry"},{"item":"ground cumin","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Brown the beef in the oil over medium-high heat, breaking it up as it cooks.', 'Add the diced onion and pepper and cook 4 minutes, then stir in the chili powder and cumin.', 'Add the tomatoes, drained beans, and a half cup of water. Season with salt.', 'Simmer 20 to 25 minutes until thick, then taste and adjust the seasoning.'],
  prep_min = 10,
  cook_min = 35
where name = 'Lean beef chili with kidney beans';

update public.meals set
  ingredients  = '[{"item":"ground turkey","qty":130,"unit":"g","aisle":"meat & seafood"},{"item":"whole wheat pasta","qty":70,"unit":"g","aisle":"grains & bread"},{"item":"tomato sauce","qty":150,"unit":"ml","aisle":"pantry"},{"item":"parmesan","qty":10,"unit":"g","aisle":"dairy & eggs"},{"item":"italian seasoning","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Mix the turkey with half the seasoning, salt, and pepper, then roll into 4 small meatballs.', 'Brown the meatballs in the oil over medium heat, about 6 minutes, turning to color all sides.', 'Pour in the tomato sauce and remaining seasoning and simmer 10 minutes until cooked through.', 'Boil the pasta in salted water until al dente, drain, and toss with the sauce. Finish with parmesan.'],
  prep_min = 15,
  cook_min = 25
where name = 'Turkey meatballs with whole-wheat pasta';

update public.meals set
  ingredients  = '[{"item":"cod fillet","qty":170,"unit":"g","aisle":"meat & seafood"},{"item":"quinoa","qty":55,"unit":"g","aisle":"grains & bread"},{"item":"green beans","qty":100,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Heat the oven to 400 F and simmer the rinsed quinoa in salted water for 15 minutes.', 'Set the cod on a lined tray, rub with half the oil, season, and top with lemon slices.', 'Bake 12 to 15 minutes until the fish is opaque and flakes easily.', 'Steam the green beans 4 minutes, toss with the remaining oil and salt, and plate everything together.'],
  prep_min = 10,
  cook_min = 25
where name = 'Baked cod with quinoa and green beans';

update public.meals set
  ingredients  = '[{"item":"tofu","qty":150,"unit":"g","aisle":"produce"},{"item":"brown rice","qty":55,"unit":"g","aisle":"grains & bread"},{"item":"coconut milk","qty":80,"unit":"ml","aisle":"pantry"},{"item":"curry powder","qty":2,"unit":"tsp","aisle":"pantry"},{"item":"onion","qty":40,"unit":"g","aisle":"produce"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Simmer the brown rice in salted water until tender, 25 to 30 minutes.', 'Cube the tofu and pat it dry. Soften the diced onion and garlic in a splash of water or a little of the coconut milk.', 'Stir in the curry powder, then add the coconut milk and tofu.', 'Simmer gently 10 minutes, season with salt, and serve over the rice.'],
  prep_min = 10,
  cook_min = 30
where name = 'Tofu curry with brown rice';

update public.meals set
  ingredients  = '[{"item":"black beans","qty":130,"unit":"g","aisle":"pantry"},{"item":"flour tortilla","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"coleslaw mix","qty":60,"unit":"g","aisle":"produce"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"},{"item":"salsa","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Warm the drained beans with the cumin and a pinch of salt, mashing lightly so they hold together.', 'Toss the slaw mix with a spoonful of the salsa.', 'Heat the tortillas in a dry pan until soft and lightly blistered.', 'Fill with beans, slaw, sliced avocado, and the remaining salsa.'],
  prep_min = 10,
  cook_min = 10
where name = 'Black bean tacos with slaw';

update public.meals set
  ingredients  = '[{"item":"sirloin steak","qty":180,"unit":"g","aisle":"meat & seafood"},{"item":"sweet potato","qty":200,"unit":"g","aisle":"produce"},{"item":"broccoli","qty":100,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Heat the oven to 425 F. Cut the sweet potato into wedges, toss with half the oil and salt, and roast 25 minutes.', 'Season the steak well and let it sit at room temperature while the potatoes cook.', 'Grill or pan-sear the steak 3 to 4 minutes per side for medium, then rest 5 minutes and slice against the grain.', 'Steam the broccoli 4 minutes and toss with the remaining oil and the minced garlic.'],
  prep_min = 10,
  cook_min = 35
where name = 'Grilled steak, sweet potato, broccoli';

update public.meals set
  ingredients  = '[{"item":"chicken thigh","qty":160,"unit":"g","aisle":"meat & seafood"},{"item":"couscous","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"zucchini","qty":100,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"smoked paprika","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Rub the thighs with the paprika, salt, and pepper.', 'Sear them in the oil over medium-high heat, about 6 minutes per side, until cooked through. Set aside to rest.', 'Saute the sliced zucchini in the same pan until golden at the edges.', 'Pour boiling salted water over the couscous, cover 5 minutes, fluff, and serve with a squeeze of lemon.'],
  prep_min = 10,
  cook_min = 20
where name = 'Chicken thighs with couscous and zucchini';

update public.meals set
  ingredients  = '[{"item":"egg","qty":2,"unit":"count","aisle":"dairy & eggs"},{"item":"canned diced tomatoes","qty":200,"unit":"g","aisle":"pantry"},{"item":"onion","qty":40,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":60,"unit":"g","aisle":"produce"},{"item":"feta cheese","qty":20,"unit":"g","aisle":"dairy & eggs"},{"item":"olive oil","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"ground cumin","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"smoked paprika","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"},{"item":"whole wheat bread","qty":1,"unit":"count","aisle":"grains & bread"}]'::jsonb,
  instructions = array['Soften the diced onion and pepper in the oil over medium heat, about 6 minutes.', 'Stir in the minced garlic, cumin, and paprika and cook 1 minute until fragrant.', 'Add the tomatoes, season with salt, and simmer 10 minutes until thickened.', 'Make two wells, crack in the eggs, cover, and cook 5 to 7 minutes until the whites set.', 'Crumble the feta over the top and serve with the bread for scooping.'],
  prep_min = 10,
  cook_min = 25
where name = 'Shakshuka with crusty bread';

update public.meals set
  ingredients  = '[{"item":"pork tenderloin","qty":170,"unit":"g","aisle":"meat & seafood"},{"item":"apple","qty":1,"unit":"count","aisle":"produce"},{"item":"carrot","qty":120,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"honey","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"dijon mustard","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Heat the oven to 425 F. Toss the carrots with half the oil and salt and start roasting.', 'Rub the pork with the mustard, honey, salt, and pepper.', 'Sear the pork in the remaining oil until browned, then move to the oven for 15 to 18 minutes until just cooked through.', 'Add the sliced apple to the carrot tray for the last 10 minutes.', 'Rest the pork 5 minutes before slicing.'],
  prep_min = 12,
  cook_min = 30
where name = 'Pork tenderloin, apples, roasted carrots';

update public.meals set
  ingredients  = '[{"item":"veggie burger patty","qty":1,"unit":"count","aisle":"frozen"},{"item":"burger bun","qty":1,"unit":"count","aisle":"grains & bread"},{"item":"potato","qty":200,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"mixed greens","qty":0.5,"unit":"cup","aisle":"produce"},{"item":"tomato","qty":40,"unit":"g","aisle":"produce"}]'::jsonb,
  instructions = array['Slice the potato into thin fries and microwave 4 minutes to par-cook.', 'Crisp the fries in most of the oil in a hot skillet, turning until golden, and salt them well.', 'Cook the patty in the remaining oil, about 4 minutes per side, while the fries finish.', 'Toast the bun and build the burger with the greens and sliced tomato.'],
  prep_min = 5,
  cook_min = 10
where name = 'Veggie burger with baked fries';

update public.meals set
  ingredients  = '[{"item":"apple","qty":1,"unit":"count","aisle":"produce"},{"item":"peanut butter","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"ground cinnamon","qty":0.25,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Core the apple and cut it into thick slices.', 'Spoon the peanut butter into a small dish for dipping.', 'Dust the slices with cinnamon and dip as you go.'],
  prep_min = 3,
  cook_min = 0
where name = 'Apple with peanut butter';

update public.meals set
  ingredients  = '[{"item":"whey protein powder","qty":35,"unit":"g","aisle":"pantry"},{"item":"cocoa powder","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"ground cinnamon","qty":0.25,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Add the protein powder, cocoa, and cinnamon to a shaker bottle.', 'Pour in about 300 ml of cold water.', 'Shake hard for 20 seconds until smooth and drink right away.'],
  prep_min = 2,
  cook_min = 0
where name = 'Protein shake (whey with water)';

update public.meals set
  ingredients  = '[{"item":"mixed nuts","qty":30,"unit":"g","aisle":"pantry"},{"item":"sunflower seeds","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"raisins","qty":2,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Combine the nuts, seeds, and raisins in a small container.', 'Shake to mix evenly.', 'Portion into a bag or jar so it is ready to grab.'],
  prep_min = 2,
  cook_min = 0
where name = 'Trail mix (nuts, seeds, dried fruit)';

update public.meals set
  ingredients  = '[{"item":"hummus","qty":5,"unit":"tbsp","aisle":"pantry"},{"item":"carrot","qty":100,"unit":"g","aisle":"produce"},{"item":"cucumber","qty":100,"unit":"g","aisle":"produce"}]'::jsonb,
  instructions = array['Peel the carrot and cut it and the cucumber into sticks.', 'Spoon the hummus into a small bowl.', 'Dip and enjoy; a crack of black pepper on the hummus is a nice touch.'],
  prep_min = 5,
  cook_min = 0
where name = 'Hummus with carrot and cucumber sticks';

update public.meals set
  ingredients  = '[{"item":"egg","qty":2,"unit":"count","aisle":"dairy & eggs"},{"item":"smoked paprika","qty":0.25,"unit":"tsp","aisle":"pantry"},{"item":"dijon mustard","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Lower the eggs into boiling water and cook 10 minutes.', 'Move them to cold water for a few minutes, then peel.', 'Halve, sprinkle with salt and the paprika, and serve with a small dab of mustard.'],
  prep_min = 2,
  cook_min = 12
where name = 'Hard-boiled eggs (2) with salt';

update public.meals set
  ingredients  = '[{"item":"cottage cheese","qty":180,"unit":"g","aisle":"dairy & eggs"},{"item":"cherry tomatoes","qty":100,"unit":"g","aisle":"produce"},{"item":"balsamic vinegar","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Spoon the cottage cheese into a bowl.', 'Halve the tomatoes and scatter them over the top.', 'Drizzle with the vinegar and season with salt and pepper.'],
  prep_min = 3,
  cook_min = 0
where name = 'Cottage cheese with cherry tomatoes';

update public.meals set
  ingredients  = '[{"item":"greek yogurt","qty":130,"unit":"g","aisle":"dairy & eggs"},{"item":"granola","qty":0.25,"unit":"cup","aisle":"grains & bread"},{"item":"honey","qty":2,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Spoon the yogurt into a bowl or jar.', 'Top with the granola just before eating so it stays crunchy.', 'Finish with a drizzle of honey.'],
  prep_min = 3,
  cook_min = 0
where name = 'Greek yogurt with granola';

update public.meals set
  ingredients  = '[{"item":"edamame","qty":160,"unit":"g","aisle":"frozen"},{"item":"lemon","qty":0.25,"unit":"count","aisle":"produce"},{"item":"chili powder","qty":0.25,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Boil or steam the edamame straight from frozen for 4 to 5 minutes.', 'Drain well and tip into a bowl.', 'Toss with a good pinch of flaky salt, the chili powder, and a squeeze of lemon.'],
  prep_min = 3,
  cook_min = 5
where name = 'Edamame with sea salt';

update public.meals set
  ingredients  = '[{"item":"egg","qty":3,"unit":"count","aisle":"dairy & eggs"},{"item":"smoked salmon","qty":70,"unit":"g","aisle":"meat & seafood"},{"item":"butter","qty":0.5,"unit":"tbsp","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Whisk the eggs with a pinch of salt.', 'Melt the butter over low heat and cook the eggs slowly, stirring, until softly set.', 'Fold in the smoked salmon in ribbons, cook 30 seconds more, and finish with black pepper.'],
  prep_min = 5,
  cook_min = 6
where name = 'Scrambled eggs with smoked salmon';

update public.meals set
  ingredients  = '[{"item":"canned sardines","qty":80,"unit":"g","aisle":"pantry"},{"item":"whole wheat bread","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"tomato","qty":60,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.25,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.25,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Toast the bread and rub it with a little of the oil.', 'Layer on thin tomato slices and season with salt.', 'Top with the drained sardines, a squeeze of lemon, and plenty of black pepper.'],
  prep_min = 5,
  cook_min = 3
where name = 'Sardines on whole-grain toast with tomato';

update public.meals set
  ingredients  = '[{"item":"canned tuna","qty":100,"unit":"g","aisle":"pantry"},{"item":"white beans","qty":150,"unit":"g","aisle":"pantry"},{"item":"onion","qty":20,"unit":"g","aisle":"produce"},{"item":"mixed greens","qty":1,"unit":"cup","aisle":"produce"},{"item":"olive oil","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Rinse and drain the beans and flake in the drained tuna.', 'Add the finely sliced onion, oil, lemon juice, salt, and pepper and toss gently.', 'Let it sit 5 minutes for the flavors to blend, then serve over the greens.'],
  prep_min = 10,
  cook_min = 0
where name = 'Tuna and white bean salad';

update public.meals set
  ingredients  = '[{"item":"tilapia fillet","qty":170,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"green beans","qty":100,"unit":"g","aisle":"produce"},{"item":"butter","qty":1,"unit":"tbsp","aisle":"dairy & eggs"},{"item":"garlic","qty":2,"unit":"count","aisle":"produce"},{"item":"lemon","qty":0.25,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Cook the rice in salted water, about 15 minutes.', 'Season the tilapia and pan-fry in half the butter, 3 minutes per side, until it flakes.', 'Melt the rest of the butter with the minced garlic in the pan and spoon it over the fish.', 'Steam the green beans 4 minutes, season, and serve everything with a squeeze of lemon.'],
  prep_min = 10,
  cook_min = 20
where name = 'Garlic-butter tilapia with rice and green beans';

update public.meals set
  ingredients  = '[{"item":"canned tuna","qty":85,"unit":"g","aisle":"pantry"},{"item":"whole wheat pasta","qty":70,"unit":"g","aisle":"grains & bread"},{"item":"frozen peas","qty":80,"unit":"g","aisle":"frozen"},{"item":"olive oil","qty":0.75,"unit":"tbsp","aisle":"pantry"},{"item":"parmesan","qty":10,"unit":"g","aisle":"dairy & eggs"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Boil the pasta in salted water, adding the peas for the last 2 minutes.', 'Drain, keeping a splash of the cooking water.', 'Toss with the drained tuna, oil, lemon juice, and enough pasta water to coat.', 'Season with salt and pepper and shower with the parmesan.'],
  prep_min = 5,
  cook_min = 10
where name = 'Tuna pasta with peas';

update public.meals set
  ingredients  = '[{"item":"shrimp","qty":120,"unit":"g","aisle":"meat & seafood"},{"item":"flour tortilla","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"coleslaw mix","qty":70,"unit":"g","aisle":"produce"},{"item":"greek yogurt","qty":30,"unit":"g","aisle":"dairy & eggs"},{"item":"chili powder","qty":1,"unit":"tsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"lemon","qty":0.5,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Toss the shrimp with the chili powder and a pinch of salt.', 'Stir the yogurt with half the lemon juice to make a quick crema, and dress the slaw with the rest.', 'Sear the shrimp in the oil over high heat, 1 to 2 minutes per side.', 'Warm the tortillas and fill with slaw, shrimp, and a drizzle of crema.'],
  prep_min = 12,
  cook_min = 8
where name = 'Shrimp tacos with cabbage slaw';

update public.meals set
  ingredients  = '[{"item":"rice cake","qty":2,"unit":"count","aisle":"grains & bread"},{"item":"smoked salmon","qty":70,"unit":"g","aisle":"meat & seafood"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"},{"item":"lemon","qty":0.25,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Mash the avocado with a squeeze of lemon, salt, and pepper.', 'Spread it over the rice cakes.', 'Drape the smoked salmon on top and finish with more pepper.'],
  prep_min = 5,
  cook_min = 0
where name = 'Smoked salmon and avocado rice cakes';

update public.meals set
  ingredients  = '[{"item":"smoked trout","qty":60,"unit":"g","aisle":"meat & seafood"},{"item":"cucumber","qty":120,"unit":"g","aisle":"produce"},{"item":"cream cheese","qty":1,"unit":"tbsp","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Slice the cucumber into thick rounds.', 'Dab each round with a little cream cheese.', 'Top with flaked smoked trout and a grind of black pepper.'],
  prep_min = 5,
  cook_min = 0
where name = 'Smoked trout on cucumber rounds';

update public.meals set
  ingredients  = '[{"item":"peanut butter","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"banana","qty":1,"unit":"count","aisle":"produce"},{"item":"soy milk","qty":250,"unit":"ml","aisle":"dairy & eggs"}]'::jsonb,
  instructions = array['Break the banana into a blender.', 'Add the peanut butter, soy milk, and a handful of ice.', 'Blend on high until completely smooth and pour into a glass.'],
  prep_min = 5,
  cook_min = 0
where name = 'Peanut butter banana smoothie with soy milk';

update public.meals set
  ingredients  = '[{"item":"chia seeds","qty":2.5,"unit":"tbsp","aisle":"pantry"},{"item":"soy milk","qty":180,"unit":"ml","aisle":"dairy & eggs"},{"item":"mango","qty":100,"unit":"g","aisle":"produce"},{"item":"maple syrup","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Whisk the chia seeds into the soy milk with the maple syrup.', 'Rest 10 minutes, whisk again to break up clumps, then refrigerate at least 2 hours or overnight.', 'Top with diced mango just before eating.'],
  prep_min = 10,
  cook_min = 0
where name = 'Chia pudding with mango';

update public.meals set
  ingredients  = '[{"item":"tofu","qty":150,"unit":"g","aisle":"produce"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"edamame","qty":60,"unit":"g","aisle":"frozen"},{"item":"carrot","qty":60,"unit":"g","aisle":"produce"},{"item":"tamari","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"olive oil","qty":0.25,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Cook the rice in salted water, about 15 minutes.', 'Cube the tofu, pat dry, and pan-fry in the oil until golden on most sides, about 8 minutes.', 'Boil the edamame 3 minutes and shave the carrot into ribbons.', 'Build the bowl over the rice and dress everything with the tamari.'],
  prep_min = 10,
  cook_min = 20
where name = 'Tofu rice bowl with edamame and carrots';

update public.meals set
  ingredients  = '[{"item":"black beans","qty":160,"unit":"g","aisle":"pantry"},{"item":"sweet potato","qty":220,"unit":"g","aisle":"produce"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"},{"item":"baby spinach","qty":1,"unit":"cup","aisle":"produce"},{"item":"salsa","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Heat the oven to 425 F. Cube the sweet potato, toss with the oil, cumin, and salt, and roast 25 minutes until browned.', 'Warm the drained beans with a pinch of salt.', 'Layer the spinach, sweet potato, and beans in a bowl.', 'Top with salsa and sliced avocado.'],
  prep_min = 10,
  cook_min = 25
where name = 'Black bean and sweet potato bowl';

update public.meals set
  ingredients  = '[{"item":"egg","qty":3,"unit":"count","aisle":"dairy & eggs"},{"item":"potato","qty":180,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":50,"unit":"g","aisle":"produce"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"smoked paprika","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Dice the potato small and cook in the oil over medium heat, covered, about 10 minutes, stirring now and then.', 'Add the diced pepper and onion and cook 5 minutes more until everything is tender and browned.', 'Season with the paprika, salt, and pepper.', 'Make three wells, crack in the eggs, cover, and cook until the whites are set, 4 to 5 minutes.'],
  prep_min = 10,
  cook_min = 20
where name = 'Egg and potato breakfast skillet';

update public.meals set
  ingredients  = '[{"item":"egg","qty":3,"unit":"count","aisle":"dairy & eggs"},{"item":"mozzarella","qty":20,"unit":"g","aisle":"dairy & eggs"},{"item":"zucchini","qty":60,"unit":"g","aisle":"produce"},{"item":"cherry tomatoes","qty":50,"unit":"g","aisle":"produce"},{"item":"onion","qty":20,"unit":"g","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"italian seasoning","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Saute the diced zucchini and onion in the oil in a small ovenproof skillet until softened, about 4 minutes.', 'Whisk the eggs with the seasoning, salt, and pepper and pour over the vegetables.', 'Scatter on the halved tomatoes and cheese and cook on low until the edges set, about 5 minutes.', 'Finish under the broiler 2 to 3 minutes until puffed and golden, then slice into wedges.'],
  prep_min = 10,
  cook_min = 12
where name = 'Garden veggie frittata';

update public.meals set
  ingredients  = '[{"item":"avocado","qty":0.5,"unit":"count","aisle":"produce"},{"item":"honeydew melon","qty":150,"unit":"g","aisle":"produce"},{"item":"greek yogurt","qty":100,"unit":"g","aisle":"dairy & eggs"},{"item":"milk","qty":100,"unit":"ml","aisle":"dairy & eggs"},{"item":"honey","qty":2,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Scoop the avocado into a blender and add the cubed melon.', 'Add the yogurt, milk, honey, and a few ice cubes.', 'Blend until silky, adding a splash more milk if it is too thick, and serve cold.'],
  prep_min = 5,
  cook_min = 0
where name = 'Avocado melon breakfast smoothie';

update public.meals set
  ingredients  = '[{"item":"rolled oats","qty":40,"unit":"g","aisle":"grains & bread"},{"item":"banana","qty":1,"unit":"count","aisle":"produce"},{"item":"egg","qty":1,"unit":"count","aisle":"dairy & eggs"},{"item":"dried lentils","qty":15,"unit":"g","aisle":"pantry"},{"item":"greek yogurt","qty":40,"unit":"g","aisle":"dairy & eggs"},{"item":"maple syrup","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"baking powder","qty":0.5,"unit":"tsp","aisle":"pantry"},{"item":"ground cinnamon","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Simmer the rinsed lentils in water until very soft, about 15 minutes, then drain. Cooked leftovers work too.', 'Blend the oats, banana, egg, yogurt, lentils, baking powder, cinnamon, and a pinch of salt into a thick batter.', 'Cook small pancakes on a lightly oiled griddle over medium heat, 2 to 3 minutes per side, until browned and set.', 'Stack and finish with the maple syrup.'],
  prep_min = 10,
  cook_min = 25
where name = 'Banana oat lentil pancakes';

update public.meals set
  ingredients  = '[{"item":"dried lentils","qty":55,"unit":"g","aisle":"pantry"},{"item":"corn tortilla","qty":3,"unit":"count","aisle":"grains & bread"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":50,"unit":"g","aisle":"produce"},{"item":"raisins","qty":1,"unit":"tbsp","aisle":"pantry"},{"item":"salsa","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"chili powder","qty":1.5,"unit":"tsp","aisle":"pantry"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Soften the diced onion and pepper in the oil, then stir in the chili powder and cumin for 1 minute.', 'Add the rinsed lentils, raisins, and 2 cups of water and season with salt.', 'Simmer 25 to 30 minutes until the lentils are tender and the filling is thick, mashing lightly at the end.', 'Warm the tortillas in a dry pan, fill with the lentils, and top with salsa.'],
  prep_min = 10,
  cook_min = 35
where name = 'Lentil tacos with corn tortillas';

update public.meals set
  ingredients  = '[{"item":"ground turkey","qty":120,"unit":"g","aisle":"meat & seafood"},{"item":"white rice","qty":55,"unit":"g","aisle":"grains & bread"},{"item":"frozen corn","qty":60,"unit":"g","aisle":"frozen"},{"item":"salsa","qty":3,"unit":"tbsp","aisle":"pantry"},{"item":"cheddar cheese","qty":20,"unit":"g","aisle":"dairy & eggs"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"chili powder","qty":1.5,"unit":"tsp","aisle":"pantry"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Brown the turkey with the diced onion in a deep skillet, breaking it up as it cooks.', 'Stir in the chili powder, cumin, and a pinch of salt, then add the rice, salsa, corn, and 1 cup of water.', 'Cover and simmer on low 15 to 18 minutes until the rice is tender and the liquid is absorbed.', 'Scatter the cheese over the top, cover 2 minutes to melt, and serve from the pan.'],
  prep_min = 10,
  cook_min = 25
where name = 'One pan taco rice with turkey';

update public.meals set
  ingredients  = '[{"item":"ground beef","qty":110,"unit":"g","aisle":"meat & seafood"},{"item":"brown rice","qty":40,"unit":"g","aisle":"grains & bread"},{"item":"bell pepper","qty":150,"unit":"g","aisle":"produce"},{"item":"tomato sauce","qty":100,"unit":"ml","aisle":"pantry"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"cheddar cheese","qty":15,"unit":"g","aisle":"dairy & eggs"},{"item":"italian seasoning","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Simmer the rice in salted water until tender, about 25 minutes, and heat the oven to 375 F.', 'Brown the beef with the diced onion, then stir in the rice, half the tomato sauce, the seasoning, salt, and pepper.', 'Halve the pepper, remove the seeds, and pack in the filling.', 'Spoon the remaining sauce over the top, cover, and bake 25 minutes. Uncover, add the cheese, and bake 5 more.'],
  prep_min = 15,
  cook_min = 35
where name = 'Stuffed bell peppers with beef and rice';

update public.meals set
  ingredients  = '[{"item":"kidney beans","qty":140,"unit":"g","aisle":"pantry"},{"item":"white rice","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"onion","qty":40,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":50,"unit":"g","aisle":"produce"},{"item":"canned diced tomatoes","qty":100,"unit":"g","aisle":"pantry"},{"item":"avocado","qty":0.25,"unit":"count","aisle":"produce"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"garlic","qty":1,"unit":"count","aisle":"produce"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Cook the rice in salted water, about 15 minutes.', 'Meanwhile soften the diced onion and pepper in the oil, then add the minced garlic and cumin for 1 minute.', 'Stir in the tomatoes and drained beans with a splash of water and simmer 10 minutes until saucy. Season with salt.', 'Spoon the beans over the rice and top with sliced avocado.'],
  prep_min = 10,
  cook_min = 25
where name = 'Red beans and rice';

update public.meals set
  ingredients  = '[{"item":"ground beef","qty":100,"unit":"g","aisle":"meat & seafood"},{"item":"whole wheat pasta","qty":60,"unit":"g","aisle":"grains & bread"},{"item":"tomato sauce","qty":150,"unit":"ml","aisle":"pantry"},{"item":"cottage cheese","qty":60,"unit":"g","aisle":"dairy & eggs"},{"item":"zucchini","qty":80,"unit":"g","aisle":"produce"},{"item":"onion","qty":30,"unit":"g","aisle":"produce"},{"item":"parmesan","qty":10,"unit":"g","aisle":"dairy & eggs"},{"item":"italian seasoning","qty":1,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Brown the beef with the diced onion in a deep skillet, then stir in the seasoning.', 'Grate the zucchini straight into the pan; it melts into the sauce as it cooks.', 'Add the tomato sauce, the pasta, and about 1 cup of water. Season with salt.', 'Cover and simmer 12 to 15 minutes, stirring occasionally, until the pasta is tender.', 'Dollop on the cottage cheese, sprinkle with parmesan, and cover 2 minutes before serving.'],
  prep_min = 10,
  cook_min = 25
where name = 'Skillet lasagna with zucchini';

update public.meals set
  ingredients  = '[{"item":"chickpeas","qty":120,"unit":"g","aisle":"pantry"},{"item":"olive oil","qty":0.5,"unit":"tbsp","aisle":"pantry"},{"item":"smoked paprika","qty":0.5,"unit":"tsp","aisle":"pantry"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"}]'::jsonb,
  instructions = array['Heat the oven to 400 F. Rinse the chickpeas and dry them very well on a towel; dry beans crisp better.', 'Toss with the oil and a good pinch of salt and spread on a baking sheet in one layer.', 'Roast 30 to 35 minutes, shaking the pan halfway, until deeply golden and crunchy.', 'Toss with the paprika and cumin while hot and cool a few minutes before eating.'],
  prep_min = 5,
  cook_min = 35
where name = 'Crispy roasted chickpeas';

update public.meals set
  ingredients  = '[{"item":"black beans","qty":100,"unit":"g","aisle":"pantry"},{"item":"greek yogurt","qty":30,"unit":"g","aisle":"dairy & eggs"},{"item":"salsa","qty":2,"unit":"tbsp","aisle":"pantry"},{"item":"cheddar cheese","qty":10,"unit":"g","aisle":"dairy & eggs"},{"item":"carrot","qty":80,"unit":"g","aisle":"produce"},{"item":"bell pepper","qty":60,"unit":"g","aisle":"produce"},{"item":"ground cumin","qty":0.5,"unit":"tsp","aisle":"pantry"},{"item":"lemon","qty":0.25,"unit":"count","aisle":"produce"}]'::jsonb,
  instructions = array['Mash the drained beans with the cumin, a squeeze of lemon, and a pinch of salt until mostly smooth.', 'Spread the beans in a shallow bowl and layer on the yogurt, then the salsa.', 'Finish with the grated cheese.', 'Cut the carrot and pepper into sticks for scooping.'],
  prep_min = 8,
  cook_min = 0
where name = 'Black bean dip with veggie sticks';


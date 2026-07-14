-- Phase 2: fill meal-coverage gaps for restrictive dietary profiles.
-- Audit findings (exact-tag matching, before diet hierarchy in app code):
--   pescatarian: 5 meals total, 0 snacks, 3 of 5 high-budget
--   gluten_free: 0 breakfasts
--   vegan: 2 breakfasts, 2 lunches
-- Part 1 retags existing meals that are factually gluten-free.
-- Part 2 adds fish-forward pescatarian meals at low/medium budget, vegan
-- breakfast/lunch options (all gluten-free), and gluten-free breakfasts.

-- Part 1: retag existing gluten-free meals.
update public.meals set tags = array_append(tags, 'gluten_free') where name = 'Greek yogurt with berries and honey' and not tags @> '{gluten_free}';
update public.meals set tags = array_append(tags, 'gluten_free') where name = 'Veggie omelette with feta' and not tags @> '{gluten_free}';
update public.meals set tags = array_append(tags, 'gluten_free') where name = 'Cottage cheese bowl with pineapple' and not tags @> '{gluten_free}';
update public.meals set tags = array_append(tags, 'gluten_free') where name = 'Apple with peanut butter' and not tags @> '{gluten_free}';
update public.meals set tags = array_append(tags, 'gluten_free') where name = 'Trail mix (nuts, seeds, dried fruit)' and not tags @> '{gluten_free}';

-- Part 2: new meals.
insert into public.meals (name, kcal, protein_g, carbs_g, fat_g, fiber_g, tags, source) values
('Scrambled eggs with smoked salmon',              350, 28, 4,  25, 0, '{breakfast,pescatarian,basic,medium,high_protein,low_carb,gluten_free}', 'USDA FDC: eggs 173424, salmon 175168'),
('Sardines on whole-grain toast with tomato',      380, 26, 34, 15, 5, '{lunch,pescatarian,minimal,low,high_protein}', 'USDA FDC: sardines 175139, bread 172686'),
('Tuna and white bean salad',                      420, 34, 38, 14, 10, '{lunch,pescatarian,minimal,low,high_protein,high_fiber,gluten_free}', 'USDA FDC: tuna 175159, white beans 175203'),
('Garlic-butter tilapia with rice and green beans',520, 38, 52, 16, 5, '{dinner,pescatarian,basic,low,high_protein,gluten_free}', 'USDA FDC: tilapia 175176, rice 168878'),
('Tuna pasta with peas',                           540, 36, 62, 14, 6, '{dinner,lunch,pescatarian,minimal,low,high_protein}', 'USDA FDC: tuna 175159, pasta 168927, peas 170419'),
('Shrimp tacos with cabbage slaw',                 500, 32, 52, 18, 7, '{dinner,pescatarian,basic,medium,high_protein}', 'USDA FDC: shrimp 175180, tortilla 168913'),
('Smoked salmon and avocado rice cakes',           240, 14, 22, 11, 3, '{snack,pescatarian,minimal,medium,high_protein,gluten_free}', 'USDA FDC: salmon 175168, avocado 171705'),
('Smoked trout on cucumber rounds',                160, 15, 5,  9,  1, '{snack,pescatarian,minimal,medium,high_protein,low_carb,gluten_free}', 'USDA FDC: trout 173717, cucumber 168409'),
('Peanut butter banana smoothie with soy milk',    380, 18, 46, 16, 6, '{breakfast,vegan,vegetarian,minimal,low,gluten_free}', 'USDA FDC: peanut butter 172470, banana 173944, soy milk 175215'),
('Chia pudding with mango',                        310, 10, 38, 14, 12, '{breakfast,snack,vegan,vegetarian,minimal,medium,high_fiber,gluten_free}', 'USDA FDC: chia 170554, mango 169910'),
('Tofu rice bowl with edamame and carrots',        480, 26, 58, 16, 9, '{lunch,vegan,vegetarian,basic,low,high_protein,gluten_free}', 'USDA FDC: tofu 172476, edamame 168411, rice 168878'),
('Black bean and sweet potato bowl',               470, 17, 74, 12, 15, '{lunch,dinner,vegan,vegetarian,basic,low,high_fiber,gluten_free}', 'USDA FDC: black beans 173735, sweet potato 168482'),
('Egg and potato breakfast skillet',               420, 22, 40, 20, 5, '{breakfast,vegetarian,basic,low,high_protein,gluten_free}', 'USDA FDC: eggs 173424, potato 170026');

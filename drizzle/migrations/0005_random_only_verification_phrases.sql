-- Use four random English words only for Roblox verification phrases.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  words text[] := array[
    'amber','anchor','apex','apple','arrow','atlas','aurora','badge','beacon','blue','brave','bridge','canyon','cinder','cobalt','comet','coral','cosmic','crystal','daring','delta','ember','falcon','feather','flare','forest','galaxy','golden','harbor','honest','jade','jupiter','lunar','maple','marble','meadow','meteor','midnight','mint','nebula','ocean','orbit','pearl','phoenix','pilot','planet','raven','rocket','sapphire','shadow','silver','solar','spark','summit','thunder','tiger','velvet','vertex','violet','wave','whisper','willow','winter','zenith'
  ];
  username text;
  phrase text := '';
  i integer;
begin
  username := trim(coalesce(new.raw_user_meta_data->>'roblox_username', ''));
  if username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Invalid Roblox username';
  end if;
  for i in 1..4 loop
    phrase := concat_ws(' ', nullif(phrase, ''), words[1 + (get_byte(extensions.gen_random_bytes(1), 0) % cardinality(words))]);
  end loop;
  insert into public.profiles (id, email, roblox_username, verify_phrase)
  values (new.id, new.email, username, phrase);
  insert into public.profile_challenges (user_id, verify_phrase)
  values (new.id, phrase);
  insert into public.user_roles (user_id, role)
  values (new.id, 'user');
  return new;
end;
$$;

-- Rotate existing challenges to the same four-word format.
do $$
declare
  words text[] := array['amber','anchor','apex','apple','arrow','atlas','aurora','badge','beacon','blue','brave','bridge','canyon','cinder','cobalt','comet','coral','cosmic','crystal','daring','delta','ember','falcon','feather','flare','forest','galaxy','golden','harbor','honest','jade','jupiter','lunar','maple','marble','meadow','meteor','midnight','mint','nebula','ocean','orbit','pearl','phoenix','pilot','planet','raven','rocket','sapphire','shadow','silver','solar','spark','summit','thunder','tiger','velvet','vertex','violet','wave','whisper','willow','winter','zenith'];
  r record;
  phrase text;
  i integer;
begin
  for r in select user_id from public.profile_challenges loop
    phrase := '';
    for i in 1..4 loop
      phrase := concat_ws(' ', nullif(phrase, ''), words[1 + (get_byte(extensions.gen_random_bytes(1), 0) % cardinality(words))]);
    end loop;
    update public.profile_challenges set verify_phrase = phrase where user_id = r.user_id;
    update public.profiles set verify_phrase = phrase where id = r.user_id;
  end loop;
end;
$$;

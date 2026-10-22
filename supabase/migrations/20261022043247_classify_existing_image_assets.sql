-- Earlier image generations were labelled as slideshows, although their outputs are still images.
update public.content_items set kind='image',metadata=metadata || jsonb_build_object('outputPaths',jsonb_build_array(output_path),'framePaths',jsonb_build_array(output_path))
where metadata->>'source'='ai-generation' and status='ready' and output_path ~* '\.(png|jpe?g|webp)$';

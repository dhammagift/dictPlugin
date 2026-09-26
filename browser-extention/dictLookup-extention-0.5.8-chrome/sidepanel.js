document.getElementById('f').src =
  new URLSearchParams(location.search).get('src') || 'https://dict.dhamma.gift/?silent';

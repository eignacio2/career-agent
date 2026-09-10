from app.scoring.score import extract_required_years


def test_plus_years_without_the_word_experience():
    """'4+ years writing production Python' is a requirement, not a biography."""
    text = "What we look for: 4+ years writing production Python."
    assert extract_required_years(text) == 4


def test_range_uses_the_low_end():
    assert extract_required_years("3-5 years of experience in data science") == 3
    assert extract_required_years("3 to 5 years of relevant experience") == 3


def test_minimum_of():
    assert extract_required_years("minimum of 4 years of experience") == 4
    assert extract_required_years("at least 3 years of professional experience") == 3


def test_word_numbers():
    assert extract_required_years("five years of experience in Python") == 5


def test_lowest_figure_is_the_gate():
    text = "3+ years in Python, 5+ years overall of data science experience."
    assert extract_required_years(text) == 3


def test_past_years_is_history_not_a_requirement():
    text = "Over the past 5 years our team has shipped three models. 2+ years of experience required."
    assert extract_required_years(text) == 2


def test_years_ago_is_ignored():
    text = "The product launched 6 years ago. We ask for 1+ years of experience."
    assert extract_required_years(text) == 1


def test_no_years_returns_none():
    assert extract_required_years("Strong Python. New graduates welcome.") is None


def test_zero_to_two_new_grad_band():
    assert extract_required_years("0-2 years of professional experience") == 0
